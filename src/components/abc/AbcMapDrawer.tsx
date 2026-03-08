import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { GoogleMap, useJsApiLoader, MarkerF, InfoWindowF } from "@react-google-maps/api";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, ArrowLeft, ExternalLink, Package, DollarSign, Loader2 } from "lucide-react";

const GOOGLE_MAPS_API_KEY = "AIzaSyDDY77D3WgSHen66tjfwDurImaZxnrXH88";

// Brazil state centers for initial zoom
const STATE_CENTERS: Record<string, { lat: number; lng: number }> = {
  AC: { lat: -9.97, lng: -67.81 }, AL: { lat: -9.57, lng: -36.78 },
  AM: { lat: -3.12, lng: -60.02 }, AP: { lat: 0.03, lng: -51.06 },
  BA: { lat: -12.97, lng: -38.51 }, CE: { lat: -3.72, lng: -38.54 },
  DF: { lat: -15.79, lng: -47.88 }, ES: { lat: -20.32, lng: -40.34 },
  GO: { lat: -16.68, lng: -49.26 }, MA: { lat: -2.53, lng: -44.28 },
  MG: { lat: -19.92, lng: -43.94 }, MS: { lat: -20.44, lng: -54.65 },
  MT: { lat: -15.60, lng: -56.10 }, PA: { lat: -1.46, lng: -48.50 },
  PB: { lat: -7.12, lng: -34.86 }, PE: { lat: -8.05, lng: -34.87 },
  PI: { lat: -5.09, lng: -42.80 }, PR: { lat: -25.43, lng: -49.27 },
  RJ: { lat: -22.91, lng: -43.17 }, RN: { lat: -5.79, lng: -35.21 },
  RO: { lat: -8.76, lng: -63.90 }, RR: { lat: 2.82, lng: -60.67 },
  RS: { lat: -30.03, lng: -51.23 }, SC: { lat: -27.59, lng: -48.55 },
  SE: { lat: -10.91, lng: -37.07 }, SP: { lat: -23.55, lng: -46.63 },
  TO: { lat: -10.18, lng: -48.33 },
};

const BRAZIL_CENTER = { lat: -14.24, lng: -51.93 };

export interface MapMarkerData {
  id: string;
  name: string;
  orders: number;
  units: number;
  revenue: number;
  classification: "A" | "B" | "C";
  lat?: number;
  lng?: number;
  orderIds?: string[];
}

interface AbcMapDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  markers: MapMarkerData[];
  level: "uf" | "city" | "neighborhood";
  selectedUf?: string | null;
  selectedCity?: string | null;
  onMarkerDrillDown?: (marker: MapMarkerData) => void;
  onViewOrder?: (orderId: string) => void;
}

const mapContainerStyle = {
  width: "100%",
  height: "100%",
};

const darkMapStyles = [
  { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a2e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a8a9a" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a2a3e" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1a2b" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

function getMarkerColor(classification: "A" | "B" | "C"): string {
  switch (classification) {
    case "A": return "#22c55e";
    case "B": return "#eab308";
    case "C": return "#ef4444";
  }
}

function getMarkerScale(orders: number, maxOrders: number): number {
  const minScale = 0.8;
  const maxScale = 1.6;
  if (maxOrders === 0) return minScale;
  return minScale + ((orders / maxOrders) * (maxScale - minScale));
}

function createMarkerIcon(classification: "A" | "B" | "C", scale: number) {
  const color = getMarkerColor(classification);
  return {
    path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
    fillColor: color,
    fillOpacity: 1,
    strokeColor: "#fff",
    strokeWeight: 1.5,
    scale,
    anchor: { x: 12, y: 24 } as google.maps.Point,
  };
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

// Geocode cache to avoid repeated API calls
const geocodeCache = new Map<string, { lat: number; lng: number }>();

async function geocodeLocation(
  geocoder: google.maps.Geocoder,
  query: string
): Promise<{ lat: number; lng: number } | null> {
  if (geocodeCache.has(query)) return geocodeCache.get(query)!;

  return new Promise((resolve) => {
    geocoder.geocode({ address: query }, (results, status) => {
      if (status === "OK" && results && results[0]) {
        const loc = {
          lat: results[0].geometry.location.lat(),
          lng: results[0].geometry.location.lng(),
        };
        geocodeCache.set(query, loc);
        resolve(loc);
      } else {
        resolve(null);
      }
    });
  });
}

export function AbcMapDrawer({
  open,
  onOpenChange,
  title,
  subtitle,
  markers,
  level,
  selectedUf,
  selectedCity,
  onMarkerDrillDown,
  onViewOrder,
}: AbcMapDrawerProps) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  });

  const [geocodedMarkers, setGeocodedMarkers] = useState<MapMarkerData[]>([]);
  const [geocoding, setGeocoding] = useState(false);
  const [selectedMarker, setSelectedMarker] = useState<MapMarkerData | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);

  // Geocode all markers when drawer opens
  useEffect(() => {
    if (!open || !isLoaded || markers.length === 0) {
      setGeocodedMarkers([]);
      return;
    }

    const geocodeAll = async () => {
      setGeocoding(true);
      if (!geocoderRef.current) {
        geocoderRef.current = new google.maps.Geocoder();
      }

      const results: MapMarkerData[] = [];

      for (const marker of markers) {
        // Skip markers already with coordinates
        if (marker.lat && marker.lng) {
          results.push(marker);
          continue;
        }

        // Build query based on level
        let query: string;
        if (level === "city") {
          query = `${marker.name}, ${selectedUf}, Brasil`;
        } else if (level === "neighborhood") {
          query = `${marker.name}, ${selectedCity}, ${selectedUf}, Brasil`;
        } else {
          // UF level - use state centers
          const center = STATE_CENTERS[marker.id];
          if (center) {
            results.push({ ...marker, lat: center.lat, lng: center.lng });
            continue;
          }
          query = `${marker.name}, Brasil`;
        }

        const loc = await geocodeLocation(geocoderRef.current, query);
        if (loc) {
          results.push({ ...marker, lat: loc.lat, lng: loc.lng });
        }

        // Small delay to respect rate limits
        await new Promise(r => setTimeout(r, 100));
      }

      setGeocodedMarkers(results);
      setGeocoding(false);
    };

    geocodeAll();
  }, [open, isLoaded, markers, level, selectedUf, selectedCity]);

  // Calculate map center and zoom
  const { center, zoom } = useMemo(() => {
    if (geocodedMarkers.length === 0) {
      if (level === "city" && selectedUf && STATE_CENTERS[selectedUf]) {
        return { center: STATE_CENTERS[selectedUf], zoom: 7 };
      }
      return { center: BRAZIL_CENTER, zoom: 4 };
    }

    const validMarkers = geocodedMarkers.filter(m => m.lat && m.lng);
    if (validMarkers.length === 0) return { center: BRAZIL_CENTER, zoom: 4 };

    if (validMarkers.length === 1) {
      return {
        center: { lat: validMarkers[0].lat!, lng: validMarkers[0].lng! },
        zoom: level === "neighborhood" ? 13 : level === "city" ? 10 : 6,
      };
    }

    const lats = validMarkers.map(m => m.lat!);
    const lngs = validMarkers.map(m => m.lng!);
    const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;

    // Simple zoom calculation
    const latSpread = Math.max(...lats) - Math.min(...lats);
    const lngSpread = Math.max(...lngs) - Math.min(...lngs);
    const spread = Math.max(latSpread, lngSpread);
    let autoZoom = 4;
    if (spread < 0.5) autoZoom = 13;
    else if (spread < 1) autoZoom = 11;
    else if (spread < 2) autoZoom = 10;
    else if (spread < 5) autoZoom = 8;
    else if (spread < 10) autoZoom = 6;
    else autoZoom = 5;

    return { center: { lat: centerLat, lng: centerLng }, zoom: autoZoom };
  }, [geocodedMarkers, level, selectedUf]);

  const maxOrders = useMemo(
    () => Math.max(...markers.map(m => m.orders), 1),
    [markers]
  );

  const classCountA = markers.filter(m => m.classification === "A").length;
  const classCountB = markers.filter(m => m.classification === "B").length;
  const classCountC = markers.filter(m => m.classification === "C").length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl lg:max-w-4xl p-0 flex flex-col">
        <SheetHeader className="p-6 pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <MapPin className="h-5 w-5 text-primary" />
            </div>
            <div>
              <SheetTitle className="text-left">{title}</SheetTitle>
              {subtitle && (
                <SheetDescription className="text-left">{subtitle}</SheetDescription>
              )}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-green-500" />
              <span>Classe A ({classCountA})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-yellow-500" />
              <span>Classe B ({classCountB})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500" />
              <span>Classe C ({classCountC})</span>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 relative">
          {!isLoaded ? (
            <div className="flex items-center justify-center h-full">
              <Skeleton className="w-full h-full" />
            </div>
          ) : geocoding ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">Localizando {markers.length} pontos no mapa...</p>
            </div>
          ) : (
            <GoogleMap
              mapContainerStyle={mapContainerStyle}
              center={center}
              zoom={zoom}
              options={{
                styles: darkMapStyles,
                disableDefaultUI: false,
                zoomControl: true,
                mapTypeControl: false,
                streetViewControl: false,
                fullscreenControl: true,
              }}
            >
              {geocodedMarkers
                .filter(m => m.lat && m.lng)
                .map((marker) => (
                  <MarkerF
                    key={marker.id}
                    position={{ lat: marker.lat!, lng: marker.lng! }}
                    icon={createMarkerIcon(
                      marker.classification,
                      getMarkerScale(marker.orders, maxOrders)
                    )}
                    onClick={() => setSelectedMarker(marker)}
                    title={marker.name}
                  />
                ))}

              {selectedMarker && selectedMarker.lat && selectedMarker.lng && (
                <InfoWindowF
                  position={{ lat: selectedMarker.lat, lng: selectedMarker.lng }}
                  onCloseClick={() => setSelectedMarker(null)}
                >
                  <div className="p-2 min-w-[200px] text-foreground">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold text-sm text-gray-900">{selectedMarker.name}</h4>
                      <Badge
                        variant="outline"
                        className={
                          selectedMarker.classification === "A"
                            ? "border-green-500 text-green-700 bg-green-50"
                            : selectedMarker.classification === "B"
                            ? "border-yellow-500 text-yellow-700 bg-yellow-50"
                            : "border-red-500 text-red-700 bg-red-50"
                        }
                      >
                        {selectedMarker.classification}
                      </Badge>
                    </div>

                    <div className="space-y-1 text-xs text-gray-600">
                      <div className="flex justify-between">
                        <span>Pedidos:</span>
                        <strong>{selectedMarker.orders}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Unidades:</span>
                        <strong>{selectedMarker.units}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Valor:</span>
                        <strong>{formatCurrency(selectedMarker.revenue)}</strong>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-3">
                      {level !== "neighborhood" && onMarkerDrillDown && (
                        <button
                          onClick={() => {
                            onMarkerDrillDown(selectedMarker);
                            setSelectedMarker(null);
                          }}
                          className="flex-1 text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 transition-colors"
                        >
                          Ver detalhes →
                        </button>
                      )}
                      {selectedMarker.orderIds && selectedMarker.orderIds.length > 0 && onViewOrder && (
                        <button
                          onClick={() => onViewOrder(selectedMarker.orderIds![0])}
                          className="flex-1 text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded hover:bg-gray-200 transition-colors flex items-center justify-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Ver pedido
                        </button>
                      )}
                    </div>
                  </div>
                </InfoWindowF>
              )}
            </GoogleMap>
          )}
        </div>

        {/* Bottom stats bar */}
        <div className="border-t p-4 flex items-center justify-between text-sm bg-muted/30">
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground">
              {geocodedMarkers.length} pontos no mapa
            </span>
          </div>
          <div className="flex items-center gap-4 text-muted-foreground">
            <span className="flex items-center gap-1">
              <Package className="h-3.5 w-3.5" />
              {markers.reduce((s, m) => s + m.orders, 0)} pedidos
            </span>
            <span className="flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5" />
              {formatCurrency(markers.reduce((s, m) => s + m.revenue, 0))}
            </span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
