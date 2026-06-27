import random
import time
from datetime import datetime

import httpx


URL = "http://localhost:8000/readings"
SENSOR_ID = "fake-sensor-001"


def build_payload() -> dict[str, object]:
	moisture = random.randint(15, 85)
	timestamp = datetime.now().isoformat()
	return {
		"sensor_id": SENSOR_ID,
		"moisture": moisture,
		"timestamp": timestamp,
	}


def main() -> None:
	print(f"Fake sensor started, posting to {URL}")

	try:
		with httpx.Client(timeout=10.0) as client:
			while True:
				payload = build_payload()

				try:
					response = client.post(URL, json=payload)
					print(f"Sent: {payload}")
					print(f"Response: {response.status_code} {response.text}")
				except httpx.HTTPError as error:
					print(f"Sent: {payload}")
					print(f"Request failed: {error}")

				time.sleep(10)
	except KeyboardInterrupt:
		print("Fake sensor stopped.")


if __name__ == "__main__":
	main()
