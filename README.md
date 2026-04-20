## Plan and state generator
This repo provides three things:
- A script that generates possible world-graph, along with listing viable plans (a listing of traversed states and summarized stats).
- A simple UI-interface to chat and reaqson about the generated files
- A script to generate a summary for a given COA

The script will generate all combination of plans that have reached the target and navigated back to the starting point. However not all plans are physically viable (eg: some plans will have negative battery usage). The notion of validity is up to the users of the dataset to define, and to break, if deemed necessary. 


### Setup
- Run `npm install`
- Run `pip install -r requirements.txt`



You need to create an `.env` file with a valid credential entry

For Gemini Developer API

```
GEMINI_API_KEY=<api_key>
```

For Vertex AI
```
GOOGLE_CLOUD_PROJECT=<project_id>
GOOGLE_CLOUD_LOCATION=<location>
GOOGLE_APPLICATION_CREDENTIALS=<path_to_credential_json>
```



### Leg and Plans
A leg is defined as possible internal/external conditions at a given step. For example:

```
{
  "comm": 0,
  "avoidance": 1,
  "turbo": 1,
  "cond": 1,
  "location": "X",
  "distance": 5000,
  "weather": "good",
  "difficulty": 29,
  "temperature": 18,
  "id": 9
}
```


A plan is a listing of leg configurations to be executed by the operator in order. The summary section provide aggregated user-metrics calculate over each state in the listing. The trip array contains leg-config and running totals.

```
{
  "id": 90112,
  "summary": {
    "time": 3167,
    "energy": 1646,
    "deliveryTime": 1700,
    "deliveryTimeMargin": -700,
    "payloadDeliveryTimeSafety": 0.5864494236949157,
    "bloodIntegrity": 1,
    "droneSafety": 0.651609837543091,
    "dronePowerSafety": 0.8098968335781485,
    "droneBatterySafety": 0.4933228415080335,
    "routeSafety": 0.5747595880509104,
    "temperatureSafety": 0,
    "ascentSafety": 1,
    "windSafety": 0.7244512092736588,
    "assetSafety": 0.6131847127970007,
    "patientSurvival": 0.7932247118474578,
    "energyReserve": -0.06,
    "payloadTemperatureDeviation": 0,
    "totalTurbo": 3,
    "totalAvoid": 3,
    "totalCond": 4,
    "totalComm": 4,
    "percentTurbo": 0.75,
    "percentAvoid": 0.75,
    "percentCond": 1,
    "percentComm": 1,
    "difficulty": 0
  },
  "trip": [
    {
      "leg": {
        "comm": 1,
        "avoidance": 0,
        "turbo": 0,
        "cond": 1,
        "leg": "XA",
        "distance": 17000,
        "weather": "good",
        "difficulty": 29,
        "temperature": 83,
        "id": 6
      },
      "stats": {
        "travelTime": 1700,
        "payloadTemperature": 4,
        "energyReserve": 0.38,
        "payloadTemperatureLoad": 0,
        "droneBatteryLoad": 0.38,
        "dronePowerLoad": 0.31,
        "droneWindLoad": 0.04,
        "droneTemperatureLoad": 2.72,
        "difficulty": 0
      }
    },
    {
      "leg": {
        "comm": 1,
        "avoidance": 1,
        "turbo": 1,
        "cond": 1,
        "leg": "AY",
        "distance": 8400,
        "weather": "good",
        "difficulty": 1480,
        "temperature": 18,
        "id": 64
      },
      "stats": {
        "travelTime": 466.67,
        "payloadTemperature": null,
        "energyReserve": 0.25,
        "payloadTemperatureLoad": 0,
        "droneBatteryLoad": 0.86,
        "dronePowerLoad": 0.25,
        "droneWindLoad": 0.04,
        "droneTemperatureLoad": 0.12,
        "difficulty": 0
      }
    },
    {
      "leg": {
        "comm": 1,
        "avoidance": 1,
        "turbo": 1,
        "cond": 1,
        "leg": "BY",
        "distance": 8000,
        "weather": "bad",
        "difficulty": 1282,
        "temperature": 50,
        "id": 80
      },
      "stats": {
        "travelTime": 444.44,
        "payloadTemperature": null,
        "energyReserve": 0.11,
        "payloadTemperatureLoad": 0,
        "droneBatteryLoad": 0.87,
        "dronePowerLoad": 0.25,
        "droneWindLoad": 0.88,
        "droneTemperatureLoad": 1.4,
        "difficulty": 0
      }
    },
    {
      "leg": {
        "comm": 1,
        "avoidance": 1,
        "turbo": 1,
        "cond": 1,
        "leg": "XB",
        "distance": 10000,
        "weather": "bad",
        "difficulty": 281,
        "temperature": 30,
        "id": 16
      },
      "stats": {
        "travelTime": 555.56,
        "payloadTemperature": null,
        "energyReserve": -0.06,
        "payloadTemperatureLoad": 0,
        "droneBatteryLoad": 0.83,
        "dronePowerLoad": 0.25,
        "droneWindLoad": 0.88,
        "droneTemperatureLoad": 0.6,
        "difficulty": 0
      }
    }
  ]
}

```


### Running
This will generate three files
- world.json: topologicial graph based on locations available
- plans.jsonl: a listing of viale plans, one per line 
- legs.json: all possible leg configurations

An optional `size:xattr:zattr` parameter can be passed into the script to do grid-based sampling. 

`size` is used to discretize `xattr` and `zattr`, which are any summary fields, into a grid. Then each cell is sampled with a plan, if applicable.


```
node ./traverse.js [size:xattr:zattr]


# e.g. default
node ./traverse.js 


# e.g. 10x10 grid by energy and time
node ./traverse.js 10:energy:time 

```



### Running with chat agent
Once the above files have been generated, you can chat with an LLM agent to reason over the generated data. 


```
node ./server.js
```

Then the UI-interface is available at `http://localhost:8888`


### Running the summary generator
Generate a short, textual summary based on plan summary. You can supply a custom text to change the style/tone the LLM responds with.

```
# Usage 1: Single generation
node ./s2.js <plan_id> [style string]

# Usage 2: Batched generation
node ./s2.js <startidx> <endidx> [style string]

# e.g.
node ./s2.js 0 50 "Be consice but creative"
```

