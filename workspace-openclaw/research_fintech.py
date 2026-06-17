import asyncio
import json
import sys
import os
import logging

# Add the skill scripts directory to the path
sys.path.append('/app/skills/data-discovery-acquisition/scripts')

# Configure logging to see progress
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

try:
    from agent_api import run_research
    print("Successfully imported run_research")
except ImportError as e:
    print(f"ImportError: {e}")
    sys.exit(1)

async def main():
    print("Starting research for MoMo, ZaloPay, and VNPay...")
    try:
        data = await run_research(
            apps=["MoMo", "ZaloPay", "VNPay"], 
            goal="product", 
            days_back=180, 
            sources=["google_play", "app_store", "youtube", "reddit", "tinhte", "voz"]
        )
        # Save to file because output might be huge
        with open('fintech_reviews.json', 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print("Research complete. Data saved to fintech_reviews.json")
    except Exception as e:
        print(f"Error during research: {e}")

if __name__ == "__main__":
    asyncio.run(main())
