import json
import sys
from typing import List, Dict
from transformers import pipeline
from transformers.pipelines.pt_utils import KeyDataset
from datasets import Dataset


pipeline = pipeline(
    "text-generation",
    model="Gensyn/Qwen2.5-1.5B-Instruct",
    trust_remote_code=True,
    device_map="auto",
)

def build_prompt(plan_dict):
    return f"""
    Summarize the following plan in one less than 10 words:

    Use thses important attributes in the 'summary' section
    - energyReserve max out at 1.0
    - patientSurvival max out at 1.0
    - assetSafety max out at 1.0
    - bloodIntegrity max out at 1.0
    - deliveryTimeMargin has no max, but higher is better

    If energyReserve is negative the flight does not come back.
    If deliveryTimeMargin is negative, the flight is late on delivery.

    The plan:
    {plan_dict}
    """






plans = []
with open("./plans.jsonl", "r", encoding="utf-8") as f:
    for line in f:
        plan = json.loads(line)
        plan["trip"] = None
        plans.append(json.loads(line))


def summarize(plan: Dict):
  summary = pipeline([
    {
      "role": "user",
      "content": build_prompt(plan)
    }
  ], max_new_tokens = 40)
  summary_text = summary[0]["generated_text"][1]["content"]
  return summary_text



if __name__ == "__main__":
    args = sys.argv[1:]
    start = int(args[0])
    end = int(args[1])

    cnt = 0
    with open(f"summaries-{start}_{end}.jsonl", "a", encoding="utf-8") as f:
        for plan in plans[start:end]:
            cnt += 1
            text = summarize(plan)
            record = { "id": plan["id"], "summary": text }
            f.write(json.dumps(record) + "\n")

            if cnt % 100 == 0:
                print(f"Processed {cnt} plans")

    print(f"Processed {cnt} plans")


# if __name__ == "__main__":
#   result = test()
#   print(">>>", result)
