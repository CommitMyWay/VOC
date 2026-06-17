import asyncio
import json
import sys
import os

# Add the skill directory to sys.path to import from scripts
sys.path.append('/app/skills/data-discovery-acquisition')

try:
    from scripts.agent_api import run_research
except ImportError as e:
    print(f"ImportError: {e}")
    sys.exit(1)

async def main():
    try:
        data = await run_research(
            apps=["ShopeePay", "ZaloPay"],
            goal="product",
            days_back=180,
            sources=["google_play", "app_store", "youtube", "reddit", "tinhte", "voz"]
        )
        print(json.dumps(data, indent=2, ensure_ascii=False))
    except Exception as e:
        print(f"Error running research: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
