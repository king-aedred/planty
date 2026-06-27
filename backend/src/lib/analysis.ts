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

export const getMoistureState = (median: number): 'critical' | 'low' | 'ok' => {
    if (median < 20) {
        return 'critical'
    }

    if (median <= 40) {
        return 'low'
    }

    return 'ok'
}

export const getTemperatureState = (median: number): 'cold' | 'ok' | 'hot' => {
    if (median < 15) {
        return 'cold'
    }

    if (median <= 28) {
        return 'ok'
    }

    return 'hot'
}

export const getLightState = (median: number): 'dark' | 'ok' | 'bright' => {
    if (median < 200) {
        return 'dark'
    }

    if (median <= 800) {
        return 'ok'
    }

    return 'bright'
}