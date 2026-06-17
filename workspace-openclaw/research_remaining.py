import asyncio
import json
import sys
import os
import logging

sys.path.append('/app/skills/data-discovery-acquisition/scripts')
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

try:
    from agent_api import run_research
except ImportError as e:
    print(f"ImportError: {e}")
    sys.exit(1)

async def main():
    print("Starting research for ZaloPay and VNPay...")
    try:
        data = await run_research(
            apps=["ZaloPay", "VNPay"], 
            goal="product", 
            days_back=180, 
            sources=["google_play", "app_store"] # Only use store sources as others failed
        )
        with open('fintech_reviews_remaining.json', 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print("Research complete. Data saved to fintech_reviews_remaining.json")
    except Exception as e:
        print(f"Error during research: {e}")

if __name__ == "__main__":
    asyncio.run(main())
