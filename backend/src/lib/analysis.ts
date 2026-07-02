export const calculateMedian = (values: number[]): number => {
    if (values.length === 0) {
        throw new Error('Cannot calculate median of an empty array')
    }

    const sortedValues = [...values].sort((left, right) => left - right)
    const middleIndex = Math.floor(sortedValues.length / 2)

    if (sortedValues.length % 2 === 1) {
        return sortedValues[middleIndex]
    }

    return (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2
}

export const DEFAULT_THRESHOLDS = {
    moisture_critical: 20,
    moisture_warning: 35,
    temperature_min: 15,
    temperature_max: 30,
    light_min: 150,
    light_max: 800,
} as const

export const getMoistureStateCustom = (
    value: number,
    criticalThreshold: number,
    warningThreshold: number,
): 'critical' | 'warning' | 'ok' => {
    if (value < criticalThreshold) {
        return 'critical'
    }

    if (value < warningThreshold) {
        return 'warning'
    }

    return 'ok'
}

export const getTemperatureStateCustom = (
    value: number,
    min: number,
    max: number,
): 'cold' | 'ok' | 'hot' => {
    if (value < min) {
        return 'cold'
    }

    if (value > max) {
        return 'hot'
    }

    return 'ok'
}

export const getLightStateCustom = (
    value: number,
    min: number,
    max: number,
): 'dark' | 'ok' | 'bright' => {
    if (value < min) {
        return 'dark'
    }

    if (value > max) {
        return 'bright'
    }

    return 'ok'
}

/** @deprecated Use getMoistureStateCustom with explicit thresholds instead. */
export const getMoistureState = (median: number): 'critical' | 'warning' | 'ok' => {
    if (median < DEFAULT_THRESHOLDS.moisture_critical) {
        return 'critical'
    }

    if (median <= 40) {
        return 'warning'
    }

    return 'ok'
}

/** @deprecated Use getTemperatureStateCustom with explicit thresholds instead. */
export const getTemperatureState = (median: number): 'cold' | 'ok' | 'hot' => {
    if (median < DEFAULT_THRESHOLDS.temperature_min) {
        return 'cold'
    }

    if (median <= 28) {
        return 'ok'
    }

    return 'hot'
}

/** @deprecated Use getLightStateCustom with explicit thresholds instead. */
export const getLightState = (median: number): 'dark' | 'ok' | 'bright' => {
    if (median < DEFAULT_THRESHOLDS.light_min) {
        return 'dark'
    }

    if (median <= DEFAULT_THRESHOLDS.light_max) {
        return 'ok'
    }

    return 'bright'
}