import json
import sys
from typing import List, Dict
from transformers import pipeline
from transformers.pipelines.pt_utils import KeyDataset
from datasets import Dataset


pipeline = pipeline(
    "text-generation",
    # model="Gensyn/Qwen2.5-1.5B-Instruct",
    model="Qwen/Qwen2.5-3B-Instruct",
    trust_remote_code=True,
    device_map="auto",
)

def build_prompt(plan_dict):
    summary = plan_dict["summary"]
    return f"""
    Reason over these metrics from a nav plan, higher values are better, less than 0.5 is not ideal
    - patientSurvival: {summary["patientSurvival"]}
    - assetSafety: {summary["assetSafety"]}
    - droneSafety: {summary["droneSafety"]}
    - routeSafety: {summary["routeSafety"]}

    Also:
    - If energyReserve ({summary["energyReserve"]}) is negative the flight does not come back.
    - If deliveryTimeMargin ({summary["deliveryTimeMargin"]}) is negative, the flight is late on delivery.
    - if difficulty ({summary["difficulty"]}) range from 0 (easy) to over 100 (hard)

    Summarize the above in a creative, short sentence in fewer than 10 words describing what can be achieved and the trade-offs
    """




plans = []
with open("./plans.jsonl", "r", encoding="utf-8") as f:
    for line in f:
        plan = json.loads(line)
        plan["trip"] = None
        plans.append(plan)


def summarize(plan: Dict):
  summary = pipeline([
    {
      "role": "user",
      "content": build_prompt(plan)
    }
  ], max_new_tokens = 25)
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
