idf_component_register(SRCS "main.c" "cycle.c" "sensors.c" "net.c" "state.c" "power.c"
                            "device.c" "onboarding.c" "config.c" "commands.c" "online.c" "ota.c"
                    INCLUDE_DIRS "."
                    PRIV_REQUIRES esp_driver_gpio esp_driver_i2c esp_adc esp_wifi esp_netif
                                  esp_event nvs_flash esp_http_client mbedtls esp_timer
                                  esp_https_ota app_update esp_app_format esp_partition)
