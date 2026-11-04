type Point = [number, number]

type Region = {
	locationId: string
	kind: 'polygon' | 'marker'
	points: Point[]
}

export function parseRegions(value: unknown, ids: Set<string>): Region[] {
	if (!Array.isArray(value) || value.length > 500) {
		throw new Error('Некорректное количество областей')
	}

	const usedLocations = new Set<string>()

	return value.map((raw: unknown) => {
		if (typeof raw !== 'object' || raw === null) {
			throw new Error('Некорректная область')
		}

		const r = raw as Record<string, unknown>

		if (typeof r.locationId !== 'string' || !ids.has(r.locationId)) {
			throw new Error('Помещение не найдено')
		}

		if (usedLocations.has(r.locationId)) {
			throw new Error(
				'На одном плане помещение можно обозначить только один раз',
			)
		}

		usedLocations.add(r.locationId)

		// Старые области без kind остаются многоугольниками.
		const kind = r.kind === 'marker' ? 'marker' : 'polygon'

		if (!Array.isArray(r.points)) {
			throw new Error('Некорректные координаты')
		}

		if (
			(kind === 'marker' && r.points.length !== 1) ||
			(kind === 'polygon' && (r.points.length < 3 || r.points.length > 100))
		) {
			throw new Error(
				kind === 'marker'
					? 'Маркер должен содержать одну точку'
					: 'Область должна содержать от 3 до 100 точек',
			)
		}

		const points: Point[] = r.points.map((p: unknown) => {
			if (
				!Array.isArray(p) ||
				p.length !== 2 ||
				p.some(
					(v) =>
						typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1000,
				)
			) {
				throw new Error('Некорректные координаты')
			}

			return [p[0], p[1]] as Point
		})

		return {
			locationId: r.locationId,
			kind,
			points,
		}
	})
}

export function uniqueLines(lines: any[]) {
	if (!Array.isArray(lines) || !lines.length || lines.length > 1000) {
		throw new Error('Добавьте строки документа')
	}

	const ids = lines.map((line) => line.id)

	if (
		ids.some((id) => typeof id !== 'string') ||
		new Set(ids).size !== ids.length
	) {
		throw new Error('Повторяющиеся или неверные строки')
	}
}
