#pragma once

#include "esp_app_desc.h"

// Einzige Quelle der Version ist PROJECT_VER in CMakeLists.txt (Projektordner).
// Sie steht im App-Header des Images und wird ueberall mitgesendet.
#define CALLGREEN_FW_VERSION (esp_app_get_description()->version)
#define CALLGREEN_HW_REV     "v3"
