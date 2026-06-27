import random
import os
from datetime import datetime

import httpx
from dotenv import load_dotenv


SENSOR_ID = "fake-sensor-001"
TOTAL_MEASUREMENTS = 18


def get_target_url() -> str:
	load_dotenv()
	convex_http_url = os.getenv("CONVEX_HTTP_URL")
	if not convex_http_url:
		raise RuntimeError("CONVEX_HTTP_URL is missing in .env")
	return f"{convex_http_url.rstrip('/')}/readings"


def clamp(value: float, minimum: float, maximum: float) -> float:
	return max(minimum, min(maximum, value))


def build_payload(state: dict[str, float]) -> dict[str, object]:
	state["moisture"] = clamp(state["moisture"] + random.randint(-2, 2), 0, 100)
	state["temperature"] = clamp(state["temperature"] + random.uniform(-0.3, 0.3), 10, 35)
	state["light_level"] = clamp(state["light_level"] + random.randint(-50, 50), 0, 2000)
	timestamp = datetime.now().isoformat(timespec="hours")
	return {
		"sensor_id": SENSOR_ID,
		"moisture": int(round(state["moisture"])),
		"temperature": round(state["temperature"], 1),
		"light_level": int(round(state["light_level"])),
		"timestamp": timestamp,
	}


def main() -> None:
	url = get_target_url()
	print(f"Fake sensor started, posting to {url}")
	state = {
		"moisture": float(random.randint(20, 80)),
		"temperature": random.uniform(18, 24),
		"light_level": float(random.randint(200, 800)),
	}

	with httpx.Client(timeout=10.0) as client:
		for measurement_number in range(1, TOTAL_MEASUREMENTS + 1):
			payload = build_payload(state)

			try:
				response = client.post(url, json=payload)
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

	print("Session abgeschlossen – 18 Messungen gesendet")


if __name__ == "__main__":
	main()
