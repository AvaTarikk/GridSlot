'use client'

import { useEffect, useRef } from 'react'
import type { CongestionPoint, CongestionSeverity } from '@/types'
import './map-view.css'

const SEVERITY_COLORS: Record<CongestionSeverity, string> = {
  GREEN: '#34d399',
  AMBER: '#fbbf24',
  RED: '#f87171',
}

const SEVERITY_RADIUS: Record<CongestionSeverity, number> = {
  GREEN: 9,
  AMBER: 12,
  RED: 15,
}

interface MapViewProps {
  points: CongestionPoint[]
  selected: CongestionPoint | null
  onSelect: (point: CongestionPoint) => void
}

// Leaflet's runtime types aren't worth importing here — keep this file dependency-light
// and typed loosely, matching the rest of the map integration.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LeafletMap = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LeafletMarker = any

/**
 * Spreads coordinates that are within a small geographic radius of each other
 * into a tiny circular fan, so overlapping congestion points (e.g. several
 * nodes clustered around Rotterdam) render as distinct, clickable markers
 * instead of stacking on top of one another.
 */
function spreadOverlappingPoints(points: CongestionPoint[]): (CongestionPoint & { _lat: number; _lng: number })[] {
  const CLUSTER_THRESHOLD_DEG = 0.045 // roughly ~5km at NL latitudes
  const SPREAD_RADIUS_DEG = 0.035

  const result: (CongestionPoint & { _lat: number; _lng: number })[] = []
  const used = new Set<string>()

  for (const pt of points) {
    if (used.has(pt.id)) continue

    // Find all not-yet-placed points within the cluster threshold of this one
    const group = points.filter(
      (p) =>
        !used.has(p.id) &&
        Math.abs(p.latitude - pt.latitude) < CLUSTER_THRESHOLD_DEG &&
        Math.abs(p.longitude - pt.longitude) < CLUSTER_THRESHOLD_DEG
    )

    if (group.length === 1) {
      result.push({ ...pt, _lat: pt.latitude, _lng: pt.longitude })
      used.add(pt.id)
      continue
    }

    // Fan the group out evenly around their shared centroid
    const centroidLat = group.reduce((s, p) => s + p.latitude, 0) / group.length
    const centroidLng = group.reduce((s, p) => s + p.longitude, 0) / group.length

    group.forEach((p, i) => {
      const angle = (i / group.length) * Math.PI * 2
      result.push({
        ...p,
        _lat: centroidLat + Math.sin(angle) * SPREAD_RADIUS_DEG,
        _lng: centroidLng + Math.cos(angle) * SPREAD_RADIUS_DEG,
      })
      used.add(p.id)
    })
  }

  return result
}

export default function MapView({ points, selected, onSelect }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap>(null)
  const leafletRef = useRef<typeof import('leaflet') | null>(null)
  const markerLayerRef = useRef<LeafletMarker>(null) // L.LayerGroup holding all current markers
  const initializedRef = useRef(false)
  const hasFitBoundsRef = useRef(false)

  // ── One-time map init ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return
    initializedRef.current = true

    async function init() {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')

      const el = containerRef.current as HTMLElement & { _leaflet_id?: number }
      if (!el || el._leaflet_id) return

      const map = L.map(el, {
        center: [52.2, 5.3],
        zoom: 8,
        zoomControl: false, // custom-styled control added below
      })

      // "voyager_nolabels" / "positron" style tiles are too light for this dark UI,
      // and dark_all is too low-contrast. dark_all + an opacity bump on the layer
      // (rather than the labelless variant) keeps place names legible while staying dark.
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors © CARTO',
        maxZoom: 19,
        className: 'gs-map-tiles',
      }).addTo(map)

      // Custom zoom control styled to match the dark surface theme
      const zoomControl = L.control.zoom({ position: 'topleft' })
      zoomControl.addTo(map)

      const markerLayer = L.layerGroup().addTo(map)

      leafletRef.current = L
      mapRef.current = map
      markerLayerRef.current = markerLayer

      renderMarkers(L, map, markerLayer, points, onSelect, hasFitBoundsRef)
    }

    init()

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        markerLayerRef.current = null
        leafletRef.current = null
        initializedRef.current = false
        hasFitBoundsRef.current = false
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Re-render markers whenever the filtered point list changes ────────────
  useEffect(() => {
    if (!leafletRef.current || !mapRef.current || !markerLayerRef.current) return
    renderMarkers(leafletRef.current, mapRef.current, markerLayerRef.current, points, onSelect, hasFitBoundsRef)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points])

  // ── Fly to selected point ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !selected) return
    mapRef.current.flyTo([selected.latitude, selected.longitude], 11, { duration: 0.8 })
  }, [selected])

  return <div ref={containerRef} className="w-full h-full" />
}

/**
 * Clears and redraws every marker for the current point list. Called both on
 * initial mount and whenever the (filtered) `points` prop changes, so the map
 * actually reflects the ALL / RED / AMBER / GREEN sidebar filter instead of
 * only ever showing whatever was passed in on first render.
 */
function renderMarkers(
  L: typeof import('leaflet'),
  map: LeafletMap,
  layer: LeafletMarker,
  points: CongestionPoint[],
  onSelect: (point: CongestionPoint) => void,
  hasFitBoundsRef: { current: boolean }
) {
  layer.clearLayers()

  const spread = spreadOverlappingPoints(points)

  spread.forEach((pt) => {
    const color = SEVERITY_COLORS[pt.severity]
    const radius = SEVERITY_RADIUS[pt.severity]
    const pos: [number, number] = [pt._lat, pt._lng]

    // Pulsing attention ring for congested (RED) points only — draws the eye
    // to the points that most need a buyer/seller's attention first.
    if (pt.severity === 'RED') {
      const pulseIcon = L.divIcon({
        className: '',
        html: `<div style="
          width:${radius * 2.6}px;height:${radius * 2.6}px;border-radius:50%;
          background:${color};opacity:0.45;
          animation:gs-pulse-ring 2.2s ease-out infinite;
        "></div>`,
        iconSize: [radius * 2.6, radius * 2.6],
        iconAnchor: [radius * 1.3, radius * 1.3],
      })
      L.marker(pos, { icon: pulseIcon, interactive: false, keyboard: false }).addTo(layer)
    }

    const outer = L.circleMarker(pos, {
      radius,
      fillColor: color,
      fillOpacity: 0.22,
      color,
      weight: 2,
      opacity: 0.9,
    })
      .bindTooltip(
        `<strong style="color:${color}">${pt.name}</strong><br/><span style="color:#94a3b8">${pt.operator}</span>`,
        { className: 'gs-tooltip', direction: 'top', offset: [0, -radius - 2] }
      )
      .on('click', () => onSelect(pt))
      .addTo(layer)

    L.circleMarker(pos, {
      radius: 4,
      fillColor: color,
      fillOpacity: 1,
      color: '#0a0c10',
      weight: 1.5,
    })
      .on('click', () => onSelect(pt))
      .addTo(layer)

    void outer
  })

  // Only auto-fit bounds on the very first populated render — avoids jarring
  // re-centers every time the filter changes after that.
  if (!hasFitBoundsRef.current && spread.length > 0) {
    const bounds = L.latLngBounds(spread.map((p) => [p._lat, p._lng] as [number, number]))
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 9 })
    hasFitBoundsRef.current = true
  }
}