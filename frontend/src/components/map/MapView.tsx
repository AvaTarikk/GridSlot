'use client'

import { useEffect, useRef } from 'react'
import type { CongestionPoint, CongestionSeverity } from '@/types'

const SEVERITY_COLORS: Record<CongestionSeverity, string> = {
  GREEN: '#22c55e',
  AMBER: '#f59e0b',
  RED: '#ef4444',
}

const SEVERITY_RADIUS: Record<CongestionSeverity, number> = {
  GREEN: 10,
  AMBER: 14,
  RED: 18,
}

interface MapViewProps {
  points: CongestionPoint[]
  selected: CongestionPoint | null
  onSelect: (point: CongestionPoint) => void
}

export default function MapView({ points, selected, onSelect }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<unknown>(null)
  const markersRef = useRef<Map<string, unknown>>(new Map())
  const initializedRef = useRef(false)

  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return
    initializedRef.current = true

    async function init() {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')

      // Guard against React strict mode double-invoke
      const el = containerRef.current as HTMLElement & { _leaflet_id?: number }
      if (!el || el._leaflet_id) return

      const map = L.map(el, {
        center: [52.3676, 4.9041],
        zoom: 8,
        zoomControl: true,
      })

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO',
        maxZoom: 19,
      }).addTo(map)

      mapRef.current = map

      points.forEach((pt) => {
        const color = SEVERITY_COLORS[pt.severity]
        const radius = SEVERITY_RADIUS[pt.severity]

        const outer = L.circleMarker([pt.latitude, pt.longitude], {
          radius,
          fillColor: color,
          fillOpacity: 0.2,
          color,
          weight: 2,
          opacity: 0.8,
        }).addTo(map).bindTooltip(`<strong>${pt.name}</strong><br/>${pt.operator}`)

        const inner = L.circleMarker([pt.latitude, pt.longitude], {
          radius: 4,
          fillColor: color,
          fillOpacity: 1,
          color: 'white',
          weight: 1.5,
        }).addTo(map)

        outer.on('click', () => onSelect(pt))
        inner.on('click', () => onSelect(pt))
        markersRef.current.set(pt.id, outer)
      })
    }

    init()

    return () => {
      if (mapRef.current) {
        ;(mapRef.current as { remove: () => void }).remove()
        mapRef.current = null
        markersRef.current.clear()
        initializedRef.current = false
      }
    }
  }, [])

  useEffect(() => {
    if (!mapRef.current || !selected) return
    ;(mapRef.current as { flyTo: (c: [number, number], z: number, o: unknown) => void })
      .flyTo([selected.latitude, selected.longitude], 11, { duration: 0.8 })
  }, [selected])

  return <div ref={containerRef} className="w-full h-full" />
}
