"""
POC: Resume-driven interview pipeline using Cognee knowledge graphs.

Flow:
  1. Extract text from resume PDF
  2. Ingest resume into Cognee and build knowledge graph
  3. Generate drill-down interview questions from the resume
  4. Collect candidate answers interactively
  5. Ingest Q&A into Cognee, rebuild graph
  6. Search the enriched knowledge graph
"""

import asyncio
import os
import sys
from pathlib import Path

import cognee
import litellm
import pdfplumber
from dotenv import load_dotenv

load_dotenv()

# Silence litellm internal logs; we handle errors ourselves.
litellm.suppress_debug_info = True

# Configure Cognee to use project-local storage instead of site-packages.
PROJECT_DIR = Path(__file__).resolve().parent
cognee.config.data_root_directory(str(PROJECT_DIR / ".data_storage"))
cognee.config.system_root_directory(str(PROJECT_DIR / ".cognee_system"))

# Patch Cognee's LocalFileStorage.store to produce valid file:// URIs on Windows.
# Without this, it emits "file://F:\..." which urlparse misreads (F: becomes netloc),
# corrupting the path to "\\F:\..." on re-read.
if os.name == "nt":
    from cognee.infrastructure.files.storage.LocalFileStorage import LocalFileStorage as _LFS

    _original_store = _LFS.store

    def _patched_store(self, file_path, data, overwrite=False):
        result = _original_store(self, file_path, data, overwrite)
        if result.startswith("file://") and not result.startswith("file:///"):
            result = "file:///" + result[len("file://"):].replace("\\", "/")
        return result

    _LFS.store = _patched_store

INTERVIEW_SYSTEM_PROMPT = """\
You are a senior technical interviewer. Your job is to generate focused, \
drill-down interview questions from a candidate's resume.

Guidelines:
- For each role listed, ask what the candidate personally owned vs. inherited.
- Ask about specific technical decisions: why a particular tech stack was chosen, \
  what trade-offs were evaluated, and what they would change in hindsight.
- Probe depth of understanding using first-principles reasoning: \
  "Walk me through how X works under the hood" or \
  "If you had to build Y from scratch, where would you start?"
- Ask about scope and impact: team size, users affected, latency/throughput numbers.
- Include one question that stress-tests a claimed skill \
  (e.g. "Explain the difference between X and Y and when you'd pick each").
- Keep questions concrete — no generic "tell me about yourself" filler.

Output exactly 5 questions, one per line, numbered 1-5. No preamble."""

INTERVIEW_USER_PROMPT = """\
Resume:
{resume_text}

Generate 5 drill-down interview questions for this candidate."""


def extract_text_from_pdf(pdf_path: str) -> str:
    """Return the full text content of a PDF, or empty string on failure."""
    text_parts: list[str] = []
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
    except Exception as e:
        print(f"Error reading PDF: {e}", file=sys.stderr)
    return "\n".join(text_parts)


async def ingest_into_cognee(text: str, dataset_name: str) -> None:
    """Add text to a Cognee dataset and run cognify to build the graph."""
    await cognee.add(text, dataset_name=dataset_name)
    await cognee.cognify([dataset_name])


def generate_interview_questions(resume_text: str) -> list[str]:
    """Call the LLM to produce drill-down interview questions from a resume."""
    response = litellm.completion(
        model=os.getenv("LLM_MODEL"),
        messages=[
            {"role": "system", "content": INTERVIEW_SYSTEM_PROMPT},
            {"role": "user", "content": INTERVIEW_USER_PROMPT.format(resume_text=resume_text)},
        ],
        api_key=os.getenv("LLM_API_KEY"),
    )
    raw = response.choices[0].message.content or ""
    return [line.strip() for line in raw.splitlines() if line.strip()]


def collect_answers(questions: list[str]) -> list[tuple[str, str]]:
    """Interactively collect candidate answers. Returns (question, answer) pairs."""
    print("\n--- Interview Questions ---\n")
    qa_pairs: list[tuple[str, str]] = []
    for question in questions:
        print(question)
        answer = input("  > ").strip()
        if answer:
            qa_pairs.append((question, answer))
        print()
    return qa_pairs


def format_qa_for_ingestion(qa_pairs: list[tuple[str, str]]) -> str:
    """Combine Q&A pairs into a single text block for Cognee ingestion."""
    sections = []
    for question, answer in qa_pairs:
        sections.append(f"Interview Question: {question}\nCandidate Answer: {answer}")
    return "\n\n".join(sections)


async def search_knowledge_graph(queries: list[str]) -> None:
    """Run a set of search queries against Cognee and print results."""
    print("\n--- Knowledge Graph Search Results ---\n")
    for query in queries:
        results = await cognee.search(query)
        print(f"Q: {query}")
        if results:
            for result in results:
                print(f"  - {result}")
        else:
            print("  (no results)")
        print()


async def main() -> None:
    if len(sys.argv) < 3:
        print("Usage: python main.py <pdf_path> <user_id>")
        sys.exit(1)

    pdf_path = sys.argv[1]
    user_id = sys.argv[2]
    dataset_name = f"user_{user_id}_profile"

    if not Path(pdf_path).exists():
        print(f"File not found: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    # Step 1: Extract resume text
    print(f"Extracting text from {pdf_path} ...")
    resume_text = extract_text_from_pdf(pdf_path)
    if not resume_text:
        print("Could not extract text from PDF.", file=sys.stderr)
        sys.exit(1)
    print(f"Extracted {len(resume_text)} characters.\n")

    # Step 2: Ingest resume into Cognee first
    print("Ingesting resume into knowledge graph ...")
    await ingest_into_cognee(resume_text, dataset_name)
    print("Resume ingested.\n")

    # Step 2.1: Visualize Resume Graph
    graph_file = f"./graph_{user_id}_resume.html"
    html_path = await cognee.visualize_graph(graph_file)
    print(f"Resume graph visualization saved to: {html_path}")

    # Step 3: Generate drill-down interview questions
    print("Generating interview questions ...")
    questions = generate_interview_questions(resume_text)
    if not questions:
        print("Failed to generate questions.", file=sys.stderr)
        sys.exit(1)
    print(f"Generated {len(questions)} questions.\n")

    # Step 4: Collect candidate answers
    qa_pairs = collect_answers(questions)
    if not qa_pairs:
        print("No answers provided.", file=sys.stderr)
        sys.exit(1)

    # Step 5: Ingest Q&A into Cognee and rebuild graph
    print("Ingesting interview answers into knowledge graph ...")
    qa_text = format_qa_for_ingestion(qa_pairs)
    await ingest_into_cognee(qa_text, dataset_name)
    print("Answers ingested.\n")

    # Step 6: Search the enriched knowledge graph
    await search_knowledge_graph([
        "What are the candidate's key technical skills?",
        "What roles and responsibilities has the candidate held?",
        "What specific projects or achievements stand out?",
    ])

    # Step 7: Visualize
    graph_file = f"./graph_{user_id}.html"
    html_path = await cognee.visualize_graph(graph_file)
    print(f"Graph visualization saved to: {html_path}")

    print(f"\nDone. Profile built for user {user_id}.")


if __name__ == "__main__":
    asyncio.run(main())
