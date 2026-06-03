'use client'

import { useEffect, useRef } from 'react'
import type { CongestionPoint, CongestionSeverity } from '@/types'

// Leaflet types
let L: typeof import('leaflet') | null = null

const SEVERITY_COLORS: Record<CongestionSeverity, string> = {
  LOW: '#22c55e',
  MEDIUM: '#f59e0b',
  HIGH: '#ef4444',
  CRITICAL: '#dc2626',
}

const SEVERITY_RADIUS: Record<CongestionSeverity, number> = {
  LOW: 10,
  MEDIUM: 14,
  HIGH: 18,
  CRITICAL: 22,
}

interface MapViewProps {
  points: CongestionPoint[]
  selected: CongestionPoint | null
  onSelect: (point: CongestionPoint) => void
}

export default function MapView({ points, selected, onSelect }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import('leaflet').Map | null>(null)
  const markersRef = useRef<Map<string, import('leaflet').CircleMarker>>(new Map())

  useEffect(() => {
    async function init() {
      if (!containerRef.current || mapRef.current) return

      // Dynamic import to avoid SSR issues
      L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')

      const map = L.map(containerRef.current, {
        center: [52.3676, 4.9041], // Amsterdam
        zoom: 8,
        zoomControl: true,
      })

      // Dark tile layer
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO',
        maxZoom: 19,
      }).addTo(map)

      mapRef.current = map
    }

    init()

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        markersRef.current.clear()
      }
    }
  }, [])

  // Update markers when points change
  useEffect(() => {
    if (!mapRef.current || !L) return

    // Remove old markers
    markersRef.current.forEach((m) => m.remove())
    markersRef.current.clear()

    points.forEach((pt) => {
      if (!L || !mapRef.current) return
      const color = SEVERITY_COLORS[pt.severity]
      const radius = SEVERITY_RADIUS[pt.severity]

      const marker = L.circleMarker([pt.latitude, pt.longitude], {
        radius,
        fillColor: color,
        fillOpacity: 0.25,
        color,
        weight: 2,
        opacity: 0.8,
      })
        .addTo(mapRef.current)
        .bindTooltip(`<strong>${pt.name}</strong><br/>${pt.operator}`, {
          className: 'leaflet-tooltip-dark',
        })

      // Inner dot
      const inner = L.circleMarker([pt.latitude, pt.longitude], {
        radius: 4,
        fillColor: color,
        fillOpacity: 1,
        color: 'white',
        weight: 1.5,
        opacity: 0.9,
      }).addTo(mapRef.current)

      marker.on('click', () => onSelect(pt))
      inner.on('click', () => onSelect(pt))

      markersRef.current.set(pt.id, marker)
    })
  }, [points, onSelect])

  // Highlight selected
  useEffect(() => {
    if (!L) return
    markersRef.current.forEach((marker, id) => {
      const pt = points.find((p) => p.id === id)
      if (!pt) return
      const color = SEVERITY_COLORS[pt.severity]
      if (id === selected?.id) {
        marker.setStyle({ weight: 3, fillOpacity: 0.4, color: 'white' })
      } else {
        marker.setStyle({ weight: 2, fillOpacity: 0.25, color })
      }
    })

    if (selected && mapRef.current) {
      mapRef.current.flyTo([selected.latitude, selected.longitude], 11, { duration: 0.8 })
    }
  }, [selected, points])

  return <div ref={containerRef} className="w-full h-full" />
}
