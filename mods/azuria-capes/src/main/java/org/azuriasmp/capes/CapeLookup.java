package org.azuriasmp.capes;

import com.google.gson.JsonParser;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Flow;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

final class CapeLookup {
    private static final URI ENDPOINT = URI.create(
        "https://opknggadvccruapapbcp.supabase.co/rest/v1/rpc/cosmetics_cape");
    // Publishable project key for the anonymous cape lookup.
    private static final String PUBLIC_KEY = "sb_publishable_GF3cA-XxPfXFPnkezFlUmA_9S2BBXD3";
    private static final int CACHE_LIMIT = 512;
    private static final long SUCCESS_TTL = Duration.ofMinutes(2).toNanos();
    private static final long FAILURE_TTL = Duration.ofSeconds(20).toNanos();

    private final LinkedHashMap<UUID, Entry> entries = new LinkedHashMap<>(16, 0.75f, true);
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3))
        .followRedirects(HttpClient.Redirect.NEVER).build();
    private final ThreadPoolExecutor worker = new ThreadPoolExecutor(1, 1, 0, TimeUnit.SECONDS,
        new ArrayBlockingQueue<>(16), task -> {
            var thread = new Thread(task, "Azuria cape lookup");
            thread.setDaemon(true);
            return thread;
        });

    private record Entry(boolean equipped, long expiresAt, boolean pending) {}

    synchronized boolean hasStarter(UUID player) {
        long now = System.nanoTime();
        var existing = entries.get(player);
        if (existing != null && (existing.pending() || existing.expiresAt() - now > 0)) {
            return existing.equipped();
        }
        var pending = new Entry(false, now, true);
        remember(player, pending);
        try {
            worker.execute(() -> refresh(player, pending));
        } catch (RejectedExecutionException ignored) {
            remember(player, new Entry(false, now + FAILURE_TTL, false));
        }
        return false;
    }

    private void remember(UUID player, Entry entry) {
        entries.put(player, entry);
        if (entries.size() > CACHE_LIMIT) entries.pollFirstEntry();
    }

    private void refresh(UUID player, Entry pending) {
        boolean equipped = false;
        long ttl = FAILURE_TTL;
        try {
            var request = HttpRequest.newBuilder(ENDPOINT).timeout(Duration.ofSeconds(5))
                .header("apikey", PUBLIC_KEY).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(
                    "{\"p_uuid\":\"" + player.toString().replace("-", "") + "\"}")).build();
            var call = http.sendAsync(request, response -> new LimitedBody());
            try {
                var response = call.get(5, TimeUnit.SECONDS);
                if (response.statusCode() == 200) {
                    equipped = isStarter(new String(response.body(), StandardCharsets.UTF_8));
                    ttl = SUCCESS_TTL;
                }
            } finally {
                // Cancel a stalled body read as well as a stalled connection.
                call.cancel(true);
            }
        } catch (ExecutionException | TimeoutException | RuntimeException ignored) {
            // Vanilla rendering remains available while the service is unreachable.
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
        synchronized (this) {
            if (entries.get(player) == pending) {
                remember(player, new Entry(equipped, System.nanoTime() + ttl, false));
            }
        }
    }

    private static final class LimitedBody implements HttpResponse.BodySubscriber<byte[]> {
        private final HttpResponse.BodySubscriber<byte[]> downstream = HttpResponse.BodySubscribers.ofByteArray();
        private Flow.Subscription subscription;
        private int remaining = 1024;

        @Override public CompletionStage<byte[]> getBody() { return downstream.getBody(); }

        @Override public void onSubscribe(Flow.Subscription subscription) {
            this.subscription = subscription;
            downstream.onSubscribe(subscription);
        }

        @Override public void onNext(List<ByteBuffer> buffers) {
            for (var buffer : buffers) {
                if (buffer.remaining() > remaining) {
                    subscription.cancel();
                    downstream.onError(new IOException("Cape response exceeded 1024 bytes"));
                    return;
                }
                remaining -= buffer.remaining();
            }
            downstream.onNext(buffers);
        }

        @Override public void onError(Throwable error) { downstream.onError(error); }
        @Override public void onComplete() { downstream.onComplete(); }
    }

    static boolean isStarter(String json) {
        var value = JsonParser.parseString(json);
        if (!value.isJsonObject()) return false;
        var object = value.getAsJsonObject();
        var id = object.get("id");
        var texture = object.get("texture");
        return id != null && id.isJsonPrimitive() && "azuria-starter".equals(id.getAsString())
            && texture != null && texture.isJsonPrimitive() && "azuria-starter.png".equals(texture.getAsString());
    }
}
