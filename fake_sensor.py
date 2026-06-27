import random
import time
from datetime import datetime

import httpx


URL = "http://localhost:8000/readings"
SENSOR_ID = "fake-sensor-001"
TOTAL_MEASUREMENTS = 18
SLEEP_SECONDS = 0


def clamp(value: float, minimum: float, maximum: float) -> float:
	return max(minimum, min(maximum, value))


def build_payload(state: dict[str, float]) -> dict[str, object]:
	state["moisture"] = clamp(state["moisture"] + random.randint(-2, 2), 0, 100)
	state["temperature"] = clamp(state["temperature"] + random.uniform(-0.3, 0.3), 10, 35)
	state["light_level"] = clamp(state["light_level"] + random.randint(-50, 50), 0, 2000)
	timestamp = datetime.now().isoformat(timespec="minutes")
	return {
		"sensor_id": SENSOR_ID,
		"moisture": int(round(state["moisture"])),
		"temperature": round(state["temperature"], 1),
		"light_level": int(round(state["light_level"])),
		"timestamp": timestamp,
	}


def main() -> None:
	print(f"Fake sensor started, posting to {URL}")
	state = {
		"moisture": float(random.randint(20, 80)),
		"temperature": random.uniform(18, 24),
		"light_level": float(random.randint(200, 800)),
	}

	with httpx.Client(timeout=10.0) as client:
		for measurement_number in range(1, TOTAL_MEASUREMENTS + 1):
			payload = build_payload(state)

			try:
				response = client.post(URL, json=payload)
				status_code = response.status_code
				print(f"Messung {measurement_number}/{TOTAL_MEASUREMENTS}")
				print(
					"Gesendet: "
					f"sensor_id={payload['sensor_id']}, "
					f"moisture={payload['moisture']}, "
					f"temperature={payload['temperature']}, "
					f"light_level={payload['light_level']}, "
					f"timestamp={payload['timestamp']}"
				)
				print(f"HTTP Status Code: {status_code}")
			except httpx.HTTPError as error:
				print(f"Messung {measurement_number}/{TOTAL_MEASUREMENTS}")
				print(
					"Gesendet: "
					f"sensor_id={payload['sensor_id']}, "
					f"moisture={payload['moisture']}, "
					f"temperature={payload['temperature']}, "
					f"light_level={payload['light_level']}, "
					f"timestamp={payload['timestamp']}"
				)
				print(f"HTTP Status Code: request failed ({error})")

			if measurement_number < TOTAL_MEASUREMENTS:
				time.sleep(SLEEP_SECONDS)

	print("Session abgeschlossen – 18 Messungen gesendet")


if __name__ == "__main__":
	main()
