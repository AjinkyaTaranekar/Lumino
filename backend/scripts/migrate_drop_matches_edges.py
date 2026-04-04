"""
One-time migration: delete all MATCHES edges from Neo4j.

MATCHES edges were created by the old SemanticMatchingService (precomputed
cosine similarity links). They are replaced by node-level embedding vectors
queried at match time via db.index.vector.queryNodes().

Run once after deploying the GraphRAG vector matching upgrade:
    python scripts/migrate_drop_matches_edges.py

Safe to re-run: if no MATCHES edges remain, the script exits cleanly.
"""

import asyncio
import os
import sys

# Allow running from the backend/ directory
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from neo4j import AsyncGraphDatabase


async def drop_matches_edges():
    uri = os.environ["NEO4J_URI"]
    user = os.environ["NEO4J_USERNAME"]
    password = os.environ["NEO4J_PASSWORD"]

    driver = AsyncGraphDatabase.driver(uri, auth=(user, password))
    try:
        await driver.verify_connectivity()
        print(f"Connected to {uri}")

        total_deleted = 0
        batch_size = 10_000

        while True:
            async with driver.session() as session:
                result = await session.run(
                    """
                    MATCH ()-[m:MATCHES]->()
                    WITH m LIMIT $batch
                    DELETE m
                    RETURN count(*) AS deleted
                    """,
                    {"batch": batch_size},
                )
                record = await result.single()
                deleted = record["deleted"] if record else 0

            total_deleted += deleted
            print(f"  Deleted {deleted} MATCHES edges (total so far: {total_deleted})")

            if deleted == 0:
                break

        # Verify
        async with driver.session() as session:
            result = await session.run(
                "MATCH ()-[m:MATCHES]->() RETURN count(m) AS remaining"
            )
            record = await result.single()
            remaining = record["remaining"] if record else 0

        if remaining == 0:
            print(f"\nDone. {total_deleted} MATCHES edges deleted. None remaining.")
        else:
            print(f"\nWARNING: {remaining} MATCHES edges still present. Re-run the script.")
            sys.exit(1)

    finally:
        await driver.close()


if __name__ == "__main__":
    asyncio.run(drop_matches_edges())
