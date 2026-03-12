from dotenv import load_dotenv
import os
import sys
import asyncio
from google import genai

################################################################################
# One off google genai invocation with results written to STDOUT
#
# Usage:
#   python ./python-ai.py <query>
################################################################################

load_dotenv()

# Change if needed
MODEL = "gemini-2.5-flash"

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY not found in environment variables")


def ask_question(query: str):
    client = genai.Client(
        api_key=GEMINI_API_KEY
    )
    response = client.models.generate_content(
        model=MODEL,
        contents=query
    )
    print(response.text)
    client.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python python-ai.py <query_sentence>")
        sys.exit(1)

    query = " ".join(sys.argv[1:])
    ask_question(query)
