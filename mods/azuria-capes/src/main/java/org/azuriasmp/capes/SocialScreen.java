package org.azuriasmp.capes;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.PlayerSkinDrawer;
import net.minecraft.client.util.DefaultSkinHelper;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.client.gui.widget.ClickableWidget;
import net.minecraft.client.gui.widget.TextFieldWidget;
import net.minecraft.text.Text;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;

public final class SocialScreen extends Screen {
    private static final int BACKGROUND = 0xEB151C2E;
    private static final int HEADER = 0xFF222C42;
    private static final int PANEL = 0xF52A344B;
    private static final int ONLINE = 0xFF62DF9E;
    private static final int ROW_HEIGHT = 23;
    private static final int LIST_TOP = 72;
    private static final int BORDER = 0xFF464B60;
    private static final int WHITE = 0xFFF0F1F8;
    private static final int MUTED = 0xFFABB0C5;
    private static final int PINK = 0xFFDF3BA9;

    private record PositionedWidget(ClickableWidget widget, int x, int y, boolean chat) {}
    private final List<PositionedWidget> widgets = new ArrayList<>();
    private final long openedAt = System.nanoTime();
    private long closingAt, chatOpenedAt;
    private int slideX, chatSlideY;
    private float closingFrom = 1;

    private JsonArray friends = new JsonArray(), messages = new JsonArray();
    private JsonObject availability = new JsonObject();
    private String accountId;
    private String name = "Azuria account", status = "online", error = "", notice = "";
    private String target, targetName, lastRead, sendId;
    private TextFieldWidget search, add, draft;
    private boolean requests, statusMenu, waiting, peerTyping, writing;
    private long nextPoll, lastInput, nextFriends;
    private int sidebar, chatX, chatY, chatWidth, chatHeight, friendOffset, messageOffset;

    public SocialScreen() {
        super(Text.literal("Azuria Social"));
    }

    @Override
    protected void init() {
        sidebar = Math.min(176, Math.max(102, width * 29 / 100));
        chatX = sidebar + Math.min(28, width / 24);
        chatY = Math.max(10, height / 14);
        chatWidth = Math.min(330, width - chatX - 8);
        chatHeight = Math.min(216, height - chatY - 12);
        rebuild();
    }

    private void rebuild() {
        String searchValue = search == null ? "" : search.getText();
        String addValue = add == null ? "" : add.getText();
        String draftValue = draft == null ? "" : draft.getText();
        clearChildren();
        widgets.clear();
        button("▾", sidebar - 26, 6, 18, () -> {
            statusMenu = !statusMenu;
            rebuild();
        });
        if (statusMenu) {
            int y = 34;
            for (String option : List.of("online", "away", "busy", "offline")) {
                button(statusLabel(option), 8, y, sidebar - 16, () -> request("presence",
                    args("status", option), data -> {
                        setPresence(data);
                        statusMenu = false;
                        rebuild();
                    }));
                y += 22;
            }
        } else {
            button("Friends", 0, 28, sidebar / 2, () -> selectTab(false));
            button("Requests", sidebar / 2, 28, sidebar - sidebar / 2, () -> selectTab(true));
        }
        search = field("Search friends…", 8, 51, sidebar - 16, searchValue, 64);
        search.setVisible(!statusMenu);
        search.setChangedListener(value -> friendOffset = 0);
        add = field("Add friend…", 8, height - 25, sidebar - 56, addValue, 24);
        button("Add", sidebar - 44, height - 26, 36, this::addFriend);
        draft = null;
        if (target != null && chatWidth >= 145 && chatHeight >= 75) {
            button("×", chatX + chatWidth - 25, chatY + 5, 20, this::closeChat);
            draft = field("Write a message…", chatX + 29, chatY + chatHeight - 25,
                chatWidth - 85, draftValue, 2000);
            draft.setChangedListener(value -> {
                lastInput = System.currentTimeMillis();
                sendId = null;
            });
            button("Send", chatX + chatWidth - 51, chatY + chatHeight - 26, 43, this::send);
        }
    }

    private TextFieldWidget field(String label, int x, int y, int w, String value, int max) {
        var field = new TextFieldWidget(textRenderer, x, y, w, 18, Text.literal(label));
        field.setPlaceholder(Text.literal(label));
        field.setMaxLength(max);
        field.setText(value);
        widgets.add(new PositionedWidget(field, x, y, x >= chatX));
        return addDrawableChild(field);
    }

    private void button(String label, int x, int y, int w, Runnable action) {
        boolean accent = label.equals("Send");
        var widget = new ButtonWidget(x, y, w, 20, Text.literal(label), b -> action.run(), text -> text.get()) {
            @Override
            protected void renderWidget(DrawContext context, int mouseX, int mouseY, float delta) {
                boolean tab = label.equals("Friends") || label.equals("Requests");
                boolean selected = tab && requests == label.equals("Requests");
                int background = accent ? (isHovered() ? 0xFFCF389E : 0xFFAD227E)
                    : selected || isHovered() || isFocused() ? 0xFF39465F : HEADER;
                context.fill(getX(), getY(), getRight(), getBottom(), background);
                context.drawBorder(getX(), getY(), getWidth(), getHeight(), BORDER);
                if (selected) context.fill(getX(), getBottom() - 2, getRight(), getBottom(), PINK);
                if (tab) {
                    String kind = label.equals("Friends") ? "friend" : "incoming";
                    int count = 0;
                    for (var entry : friends) {
                        if (kind.equals(string(entry.getAsJsonObject(), "kind"))) count++;
                    }
                    drawScrollableText(context, textRenderer, Text.literal(count + " " + label),
                        getX() + 3, getY(), getRight() - 3, getBottom(), WHITE);
                } else drawScrollableText(context, textRenderer, 4, WHITE);
            }
        };
        widgets.add(new PositionedWidget(widget, x, y, x >= chatX));
        addDrawableChild(widget);
    }

    private void selectTab(boolean value) {
        requests = value;
        friendOffset = 0;
    }

    @Override
    public boolean shouldPause() {
        return false;
    }

    @Override
    public void close() {
        if (closingAt != 0) return;
        closingAt = System.nanoTime();
        closingFrom = easeOut(progress(closingAt, openedAt, 225));
    }

    private static float progress(long now, long start, int millis) {
        return Math.clamp((now - start) / (millis * 1_000_000f), 0f, 1f);
    }

    private static float easeOut(float progress) {
        float remaining = 1 - progress;
        return 1 - remaining * remaining * remaining;
    }

    @Override
    public void tick() {
        if (closingAt != 0) {
            if (progress(System.nanoTime(), closingAt, 165) >= 1) super.close();
            return;
        }
        long now = System.currentTimeMillis();
        if (waiting || now < nextPoll) return;
        nextPoll = now + 2300;
        if (now >= nextFriends) {
            nextFriends = now + 12000;
            request("friends", new JsonObject(), data -> {
                String id = string(data, "accountId");
                if (accountId != null && !accountId.equals(id)) closeChat();
                accountId = id;
                friends = array(data, "entries");
                String account = string(data, "name");
                if (!account.isBlank()) name = account;
                JsonObject current = object(data, "presence");
                if (!current.isEmpty()) applyPresence(current);
            });
        } else if (target != null) {
            var peer = target;
            boolean typing = draft != null && !draft.getText().isBlank() && now - lastInput < 4500;
            JsonObject query = args("target", peer);
            if (typing || writing) query.addProperty("typing", typing);
            request("presence", query, data -> {
                applyPresence(object(data, "data"));
                if (peer.equals(target)) {
                    writing = typing;
                    peerTyping = object(data, "data").has("typing") && object(data, "data").get("typing").getAsBoolean();
                }
            }, () -> history(peer));
        }
    }

    private void history(String peer) {
        if (!peer.equals(target)) return;
        request("history", args("target", peer), data -> {
            if (!peer.equals(target)) return;
            messages = array(data, "data");
            if (!messages.isEmpty()) {
                var newest = messages.get(0).getAsJsonObject();
                String id = string(newest, "id");
                if (peer.equals(string(newest, "sender_id")) && !id.equals(lastRead)) {
                    var read = args("target", peer);
                    read.addProperty("id", id);
                    request("read", read, ignored -> lastRead = id);
                }
            }
        });
    }

    @Override
    public void renderBackground(DrawContext ctx, int mouseX, int mouseY, float delta) {
        // Vanilla's screen background applies a full-frame blur. This overlay draws its own tint.
    }

    @Override
    public void render(DrawContext ctx, int mouseX, int mouseY, float delta) {
        long time = System.nanoTime();
        float transition = closingAt == 0 ? easeOut(progress(time, openedAt, 225))
            : closingFrom * (1 - easeOut(progress(time, closingAt, 165)));
        slideX = Math.round(-sidebar * (1 - transition));
        chatSlideY = closingAt == 0
            ? Math.round(-12 * (1 - easeOut(progress(time, chatOpenedAt, 175))))
            : Math.round(-chatHeight * easeOut(progress(time, closingAt, 165)));
        ctx.fill(0, 0, width, height, (Math.round(51 * transition) << 24) | 0x060913);
        for (var item : widgets) {
            item.widget().setX(item.x() + (item.chat() ? 0 : slideX));
            item.widget().setY(item.y() + (item.chat() ? chatSlideY : 0));
        }

        ctx.getMatrices().push();
        ctx.getMatrices().translate(slideX, 0, 0);
        renderSidebar(ctx, mouseX - slideX, mouseY);
        ctx.getMatrices().pop();
        if (target != null && draft != null) {
            ctx.getMatrices().push();
            ctx.getMatrices().translate(0, chatSlideY, 0);
            renderChat(ctx);
            ctx.getMatrices().pop();
        }
        super.render(ctx, mouseX, mouseY, delta);
    }

    private int listBottom() {
        return height - 43;
    }

    private int rowsOnScreen() {
        return Math.max(0, (listBottom() - LIST_TOP) / ROW_HEIGHT);
    }

    private void renderSidebar(DrawContext ctx, int mouseX, int mouseY) {
        ctx.fill(0, 0, sidebar, height, BACKGROUND);
        ctx.fill(0, 0, sidebar, 28, HEADER);
        ctx.fill(0, height - 31, sidebar, height, HEADER);
        ctx.fill(sidebar - 1, 0, sidebar, height, BORDER);
        if (client != null && client.player != null)
            PlayerSkinDrawer.draw(ctx, client.player.getSkinTextures(), 7, 5, 18);
        label(ctx, name, 30, 5, sidebar - 62, accountId == null ? WHITE : statusColor(status));
        label(ctx, accountId == null ? "" : statusLabel(status), 30, 16, sidebar - 62, MUTED);
        if (!statusMenu) {
            List<JsonObject> rows = visibleFriends();
            int visible = rowsOnScreen();
            friendOffset = Math.min(friendOffset, Math.max(0, rows.size() - visible));
            int y = LIST_TOP;
            for (int i = friendOffset; i < Math.min(rows.size(), friendOffset + visible); i++, y += ROW_HEIGHT) {
                var row = rows.get(i);
                String id = string(row, "account_id");
                String state = string(availability, id);
                if (mouseX >= 5 && mouseX < sidebar - 8 && mouseY >= y && mouseY < y + ROW_HEIGHT
                    || id.equals(target)) ctx.fill(4, y, sidebar - 7, y + ROW_HEIGHT, 0xFF303B54);
                int color = statusColor(state);
                PlayerSkinDrawer.draw(ctx, DefaultSkinHelper.getSkinTextures(UUID.fromString(id)), 8, y + 3, 17);
                ctx.fill(sidebar - 17, y + 8, sidebar - 12, y + 13, color);
                label(ctx, string(row, "display_name"), 31, y + 2, sidebar - 51, state.isEmpty() ? WHITE : color);
                if (requests) {
                    label(ctx, "Accept", 31, y + 12, sidebar / 2 - 18, 0xFF55D69A);
                    label(ctx, "Decline", sidebar * 65 / 100, y + 12, sidebar / 3, MUTED);
                } else {
                    label(ctx, state.isEmpty() ? "Offline" : statusLabel(state),
                        31, y + 12, sidebar - 52, MUTED);
                }
            }
            if (visible > 0 && rows.size() > visible) {
                int track = visible * ROW_HEIGHT;
                int handle = Math.max(8, track * visible / rows.size());
                int top = LIST_TOP + (track - handle) * friendOffset / (rows.size() - visible);
                ctx.fill(sidebar - 4, LIST_TOP, sidebar - 2, LIST_TOP + track, HEADER);
                ctx.fill(sidebar - 4, top, sidebar - 2, top + handle, BORDER);
            }
        }
        if (target != null && draft == null)
            label(ctx, "Increase window size for chat.", 8, height - 41, sidebar - 16, MUTED);
        if (!statusMenu && visibleFriends().isEmpty()) {
            String state = waiting ? "Connecting to Azuria…" :
                !error.isEmpty() ? error : accountId == null ? "Checking your Azuria account…" :
                requests ? "No pending requests" : "No friends found";
            int y = LIST_TOP;
            for (var line : textRenderer.wrapLines(Text.literal(state), sidebar - 16)) {
                if (y + 10 >= height - 43) break;
                ctx.drawTextWithShadow(textRenderer, line, 8, y, MUTED);
                y += 11;
            }
        }
        String feedback = error.isEmpty() ? notice : error;
        if (!feedback.isEmpty()) label(ctx, feedback, 8, height - 39, sidebar - 16, error.isEmpty() ? MUTED : 0xFFFFA3A9);
    }

    private void renderChat(DrawContext ctx) {
        int right = chatX + chatWidth, bottom = chatY + chatHeight;
        ctx.fill(chatX + 2, chatY + 3, right + 2, bottom + 3, 0x50060913);
        ctx.fill(chatX, chatY, right, bottom, PANEL);
        ctx.fill(chatX + 1, chatY + 1, chatX + 24, bottom - 1, BACKGROUND);
        ctx.fill(chatX + 24, chatY + 1, right - 1, chatY + 30, HEADER);
        ctx.fill(chatX + 24, bottom - 31, right - 1, bottom - 1, HEADER);
        ctx.fill(chatX + 23, chatY + 1, chatX + 24, bottom - 1, BORDER);
        PlayerSkinDrawer.draw(ctx, DefaultSkinHelper.getSkinTextures(UUID.fromString(target)), chatX + 5, chatY + 7, 14);
        ctx.drawBorder(chatX, chatY, chatWidth, chatHeight, BORDER);
        ctx.fill(chatX + 1, chatY + 30, right - 1, chatY + 31, BORDER);
        ctx.fill(chatX + 1, bottom - 43, right - 1, bottom - 42, BORDER);
        String state = string(availability, target);
        label(ctx, targetName, chatX + 30, chatY + 6, chatWidth - 60, state.isEmpty() ? WHITE : statusColor(state));
        label(ctx, state.isEmpty() ? "Offline" : statusLabel(state), chatX + 30, chatY + 17, chatWidth - 60, MUTED);
        ctx.enableScissor(chatX + 29, chatY + 34, right - 8, bottom - 41);
        int y = bottom - 45;
        for (int i = Math.min(messageOffset, messages.size()); i < messages.size() && y > chatY + 27; i++) {
            var message = messages.get(i).getAsJsonObject();
            var lines = textRenderer.wrapLines(Text.literal(string(message, "body")), chatWidth - 43);
            y -= lines.size() * 10;
            int rowY = y;
            for (var line : lines) {
                ctx.drawTextWithShadow(textRenderer, line, chatX + 30, rowY, WHITE);
                rowY += 10;
            }
            y -= 17;
            label(ctx, target.equals(string(message, "sender_id")) ? targetName : "You",
                chatX + 30, y + 3, chatWidth - 43, MUTED);
        }
        ctx.disableScissor();
        if (peerTyping) label(ctx, targetName + " is typing…", chatX + 30, bottom - 40, chatWidth - 38, MUTED);
    }

    private List<JsonObject> visibleFriends() {
        String filter = search.getText().strip().toLowerCase(Locale.ROOT);
        List<JsonObject> rows = new ArrayList<>();
        for (var item : friends) {
            var row = item.getAsJsonObject();
            if (string(row, "kind").equals(requests ? "incoming" : "friend")
                && (string(row, "display_name") + " " + string(row, "username")).toLowerCase(Locale.ROOT).contains(filter)) {
                rows.add(row);
            }
        }
        rows.sort(Comparator.comparing((JsonObject row) -> string(availability, string(row, "account_id")).isEmpty())
            .thenComparing(row -> string(row, "display_name"), String.CASE_INSENSITIVE_ORDER));
        return rows;
    }

    @Override
    public boolean mouseClicked(double x, double y, int button) {
        if (closingAt != 0) return true;
        if (super.mouseClicked(x, y, button)) return true;
        x -= slideX;
        if (button != 0 || statusMenu || x < 8 || x >= sidebar - 8 || y < LIST_TOP || y >= listBottom()) return false;
        int rowIndex = (int) (y - LIST_TOP) / ROW_HEIGHT;
        int i = rowIndex + friendOffset;
        var rows = visibleFriends();
        if (i >= rows.size() || rowIndex >= rowsOnScreen()) return false;
        var row = rows.get(i);
        String id = string(row, "account_id");
        if (requests) {
            request(x < sidebar * 0.65 ? "accept" : "decline", args("target", id), ignored -> nextFriends = 0);
        } else {
            closeChat();
            target = id;
            chatOpenedAt = System.nanoTime();
            targetName = string(row, "display_name");
            rebuild();
            history(id);
        }
        return true;
    }

    @Override
    public boolean mouseScrolled(double x, double y, double horizontal, double vertical) {
        if (closingAt != 0) return true;
        if (vertical != 0 && x < sidebar + slideX && y >= LIST_TOP && y < listBottom() && !statusMenu) {
            friendOffset = Math.clamp(friendOffset + (vertical < 0 ? 1 : -1), 0,
                Math.max(0, visibleFriends().size() - rowsOnScreen()));
            return true;
        }
        if (vertical != 0 && draft != null && x >= chatX && x < chatX + chatWidth
            && y >= chatY + chatSlideY && y < chatY + chatHeight + chatSlideY) {
            messageOffset = Math.clamp(messageOffset + (vertical > 0 ? 1 : -1), 0, Math.max(0, messages.size() - 1));
            return true;
        }
        return super.mouseScrolled(x, y, horizontal, vertical);
    }

    @Override
    public boolean keyPressed(int key, int scan, int modifiers) {
        if (closingAt != 0) return true;
        if (key == org.lwjgl.glfw.GLFW.GLFW_KEY_ENTER) {
            if (draft != null && draft.isFocused()) { send(); return true; }
            if (add.isFocused()) { addFriend(); return true; }
        }
        return super.keyPressed(key, scan, modifiers);
    }

    private void addFriend() {
        String username = add.getText().strip();
        if (username.isEmpty()) return;
        request("add", args("username", username), ignored -> {
            add.setText("");
            notice = "Friend request sent";
            nextFriends = 0;
        });
    }

    private void send() {
        if (draft == null || target == null || draft.getText().isBlank()) return;
        String peer = target;
        String body = draft.getText();
        var query = args("target", peer);
        query.addProperty("body", body);
        if (waiting) return;
        if (sendId == null) sendId = UUID.randomUUID().toString();
        query.addProperty("id", sendId);
        request("send", query, data -> {
            if (!peer.equals(target)) return;
            if (draft != null && draft.getText().equals(body)) draft.setText("");
            messageOffset = 0;
            history(peer);
        });
    }

    private void closeChat() {
        target = null;
        draft = null;
        messages = new JsonArray();
        peerTyping = false;
        writing = false;
        messageOffset = 0;
        lastRead = null;
        sendId = null;
        rebuild();
    }

    private void setPresence(JsonObject reply) { applyPresence(object(reply, "data")); }
    private void applyPresence(JsonObject data) {
        String selected = string(data, "status");
        if (!selected.isEmpty()) status = selected;
        if (data.has("friends") && data.get("friends").isJsonObject()) availability = object(data, "friends");
    }

    private void request(String action, JsonObject query, Consumer<JsonObject> apply) {
        request(action, query, apply, () -> {});
    }

    private void request(String action, JsonObject query, Consumer<JsonObject> apply, Runnable after) {
        if (waiting || client == null) return;
        var game = client;
        waiting = true;
        query.addProperty("action", action);
        CompletableFuture.supplyAsync(() -> exchange(query)).thenAccept(reply -> game.execute(() -> {
            waiting = false;
            if (game.currentScreen != this) return;
            error = string(reply, "error");
            if (error.isEmpty()) apply.accept(object(reply, "data"));
            else if (error.equals("An account request is already running.")) {
                nextPoll = System.currentTimeMillis() + 500;
                if (action.equals("friends")) nextFriends = 0;
            }
            else if (error.startsWith("Sign in to your Azuria account") || error.startsWith("Your Azuria session has expired")) {
                friends = new JsonArray();
                availability = new JsonObject();
                accountId = null;
                name = "Azuria account";
                closeChat();
            }
            if (!waiting) after.run();
        }));
    }

    private static JsonObject exchange(JsonObject query) {
        String key = System.getenv("AZURIA_COMPANION_KEY");
        String port = System.getenv("AZURIA_COMPANION_PORT");
        if (key == null || port == null) return args("error", "Start Minecraft from an Azuria-enabled profile.");
        query.addProperty("key", key);
        try (Socket socket = new Socket(java.net.Proxy.NO_PROXY)) {
            socket.connect(new InetSocketAddress("127.0.0.1", Integer.parseInt(port)), 1500);
            socket.setSoTimeout(24000);
            try (var output = new BufferedWriter(new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8));
                 var input = socket.getInputStream()) {
                output.write(query.toString());
                output.newLine();
                output.flush();
                byte[] data = input.readNBytes(1024 * 1024 + 1);
                if (data.length > 1024 * 1024) throw new IOException("Oversized response");
                return JsonParser.parseString(new String(data, StandardCharsets.UTF_8)).getAsJsonObject();
            }
        } catch (IOException | RuntimeException failure) {
            return args("error", "Could not connect to the Azuria Launcher.");
        }
    }

    private void label(DrawContext ctx, String text, int x, int y, int maxWidth, int color) {
        ctx.drawTextWithShadow(textRenderer, textRenderer.trimToWidth(text, Math.max(0, maxWidth)), x, y, color);
    }

    private static int statusColor(String state) {
        return switch (state) {
            case "online" -> ONLINE;
            case "away" -> 0xFFFFC36C;
            case "busy" -> 0xFFFF7985;
            default -> MUTED;
        };
    }

    private static String statusLabel(String value) {
        return switch (value) {
            case "away" -> "Away";
            case "busy" -> "Do not disturb";
            case "offline" -> "Appear offline";
            default -> "Online";
        };
    }
    private static JsonObject args(String name, String value) {
        var object = new JsonObject();
        object.addProperty(name, value);
        return object;
    }
    private static String string(JsonObject object, String key) {
        return object.has(key) && object.get(key).isJsonPrimitive() ? object.get(key).getAsString() : "";
    }
    private static JsonObject object(JsonObject object, String key) {
        return object.has(key) && object.get(key).isJsonObject() ? object.getAsJsonObject(key) : new JsonObject();
    }
    private static JsonArray array(JsonObject object, String key) {
        return object.has(key) && object.get(key).isJsonArray() ? object.getAsJsonArray(key) : new JsonArray();
    }
}
