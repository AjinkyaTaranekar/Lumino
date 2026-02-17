# Cognee POC — Resume-Driven Interview Pipeline

Proof-of-concept that ingests a resume into a [Cognee](https://github.com/topoteretes/cognee) knowledge graph, generates drill-down interview questions, and enriches the graph with candidate answers.

## Flow

1. Extract text from a resume PDF
2. Ingest resume into Cognee and build knowledge graph
3. Visualize the resume graph
4. Generate drill-down interview questions via LLM
5. Collect candidate answers interactively
6. Ingest Q&A into Cognee, rebuild graph
7. Search the enriched knowledge graph

## Setup

```bash
pip install -r requirements.txt
```

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Then fill in your Gemini API key in `.env`.

## Usage

```bash
python main.py <path-to-resume.pdf> <user_id>
```

Example:

```bash
python main.py Ajinkya_Taranekar_Software_Engineer_Resume_2026.pdf ajinkya
```

## Notes

- Uses Gemini free tier by default. Rate limits are configured in `.env` to stay within quota.
- Graph database is Kuzu (embedded). Requires the VC++ 2022 runtime on Windows (`scoop install extras/vcredist2022`).
- Graph visualization is saved as an HTML file in the current directory.
