'use client';

import { useEffect, useState, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface VehiclePosition {
  id: string;
  placa: string;
  modelo: string;
  status: string;
  lat: number;
  lng: number;
  speed?: number;
  last_update: string;
}

interface GpsMapProps {
  vehicles?: VehiclePosition[];
}

// Custom icons for different statuses
const getMarkerIcon = (status: string): L.Icon => {
  const colors: Record<string, string> = {
    ativo: '#22C55E',
    manutencao: '#F59E0B',
    docs_vencidos: '#EF4444',
    inactive: '#6B7280',
  };

  const color = colors[status] || colors.inactive;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 40"><path d="M15 2 C 8 2, 3 7, 3 14 C 3 24, 15 38, 15 38 C 15 38, 27 24, 27 14 C 27 7, 22 2, 15 2 Z" fill="${color}" stroke="white" stroke-width="1.5"/><circle cx="15" cy="14" r="5" fill="white"/></svg>`;

  return L.icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(svg)}`,
    iconSize: [30, 40],
    iconAnchor: [15, 40],
    popupAnchor: [0, -40],
  });
};

export function GpsMap({ vehicles = [] }: GpsMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<L.Marker[]>([]);
  const [positions, setPositions] = useState<VehiclePosition[]>(vehicles);
  const [loading, setLoading] = useState(!vehicles || vehicles.length === 0);

  // Fetch positions on mount and set up refresh interval
  useEffect(() => {
    const fetchPositions = async () => {
      try {
        const res = await fetch('/api/fleet/positions');
        if (res.ok) {
          const data = await res.json();
          setPositions(data.vehicles || []);
        }
      } catch (error) {
        console.error('Error fetching vehicle positions:', error);
      } finally {
        setLoading(false);
      }
    };

    if (loading) {
      fetchPositions();
    }

    // Refresh positions every 30 seconds
    const interval = setInterval(fetchPositions, 30000);
    return () => clearInterval(interval);
  }, [loading]);

  // Initialize map and update markers
  useEffect(() => {
    if (!mapContainer.current) return;

    // Initialize map if needed
    if (!map.current) {
      map.current = L.map(mapContainer.current).setView([-15.783087, -47.879822], 4); // Center on Brazil

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map.current);
    }

    // Clear existing markers
    markers.current.forEach((marker) => marker.remove());
    markers.current = [];

    // Add new markers
    positions.forEach((vehicle) => {
      if (map.current && typeof vehicle.lat === 'number' && typeof vehicle.lng === 'number') {
        const marker = L.marker([vehicle.lat, vehicle.lng], {
          icon: getMarkerIcon(vehicle.status),
        })
          .bindPopup(`
            <div style="font-size: 12px; width: 200px;">
              <strong>${vehicle.placa}</strong><br/>
              <small>${vehicle.modelo}</small><br/>
              <hr style="margin: 4px 0;" />
              <small><strong>Status:</strong> ${vehicle.status}</small><br/>
              ${vehicle.speed ? `<small><strong>Velocidade:</strong> ${vehicle.speed} km/h</small><br/>` : ''}
              <small><strong>Última atualização:</strong></small><br/>
              <small>${new Date(vehicle.last_update).toLocaleString('pt-BR')}</small>
            </div>
          `)
          .addTo(map.current);

        markers.current.push(marker);
      }
    });
  }, [positions]);

  if (loading) {
    return (
      <div className="w-full h-96 bg-[var(--bg-tertiary)] rounded-lg flex items-center justify-center border border-[var(--border-primary)]">
        <div className="text-center">
          <div className="inline-block animate-spin">
            <div className="w-8 h-8 border-4 border-[var(--border-primary)] border-t-[var(--vigi-gold)] rounded-full"></div>
          </div>
          <p className="text-[var(--text-secondary)] mt-2">Carregando posições GPS...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-[var(--vigi-navy)]">Mapa de Rastreamento</h3>
        <div className="flex gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[var(--status-success)]"></div>
            <span>Ativo</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[var(--status-warning)]"></div>
            <span>Manutenção</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[var(--status-danger)]"></div>
            <span>Docs Vencidos</span>
          </div>
        </div>
      </div>

      <div
        ref={mapContainer}
        className="w-full h-96 rounded-lg border border-[var(--border-primary)] shadow-sm overflow-hidden"
        style={{ backgroundColor: '#f5f5f5' }}
      />

      <div className="text-xs text-[var(--text-secondary)] text-center">
        {positions.length > 0 ? (
          <p>
            Mostrando {positions.length} veículo{positions.length !== 1 ? 's' : ''} • Atualizado
            automaticamente a cada 30 segundos
          </p>
        ) : (
          <p>Nenhum veículo com GPS configurado</p>
        )}
      </div>
    </div>
  );
}
