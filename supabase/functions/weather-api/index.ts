// Weather proxy - no auth required (public weather data)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { city, country } = await req.json();

    if (!city) {
      return new Response(
        JSON.stringify({ error: "City is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("OPENWEATHERMAP_API_KEY");
    if (!apiKey) {
      console.error("[weather-api] OPENWEATHERMAP_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Weather API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const query = country ? `${city},${country}` : city;
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(query)}&appid=${apiKey}&units=metric&lang=pt_br`;

    console.log(`[weather-api] Fetching weather for: ${query}`);

    const weatherRes = await fetch(url);
    const weatherData = await weatherRes.json();

    if (!weatherRes.ok) {
      console.error("[weather-api] OpenWeatherMap error:", weatherData);
      return new Response(
        JSON.stringify({
          error: weatherData.message || "Failed to fetch weather",
          code: weatherData.cod,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = {
      temperature: Math.round(weatherData.main.temp),
      feelsLike: Math.round(weatherData.main.feels_like),
      humidity: weatherData.main.humidity,
      windSpeed: Math.round(weatherData.wind.speed * 3.6), // m/s -> km/h
      condition: weatherData.weather[0]?.main?.toLowerCase() || "unknown",
      conditionDescription: weatherData.weather[0]?.description || "",
      city: weatherData.name,
      country: weatherData.sys?.country || "",
      icon: weatherData.weather[0]?.icon || "",
    };

    console.log(`[weather-api] Success: ${result.city} ${result.temperature}°C ${result.condition}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[weather-api] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
