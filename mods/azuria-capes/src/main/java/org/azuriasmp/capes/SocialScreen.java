package org.azuriasmp.capes;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.PlayerSkinDrawer;
import net.minecraft.client.util.DefaultSkinHelper;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.ButtonWidget;
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
    private static final int BACKGROUND = 0xEF191C28;
    private static final int BORDER = 0xFF464B60;
    private static final int WHITE = 0xFFF0F1F8;
    private static final int MUTED = 0xFFABB0C5;
    private static final int PINK = 0xFFDF3BA9;

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
        sidebar = Math.min(200, Math.max(104, width / 3));
        chatX = sidebar + 8;
        chatY = 12;
        chatWidth = Math.min(330, width - chatX - 8);
        chatHeight = Math.min(222, height - chatY - 8);
        rebuild();
    }

    private void rebuild() {
        String searchValue = search == null ? "" : search.getText();
        String addValue = add == null ? "" : add.getText();
        String draftValue = draft == null ? "" : draft.getText();
        clearChildren();
        button(statusLabel(status) + " ▾", sidebar - 78, 10, 70, () -> {
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
            button("Friends", 8, 34, (sidebar - 18) / 2, () -> selectTab(false));
            button("Requests", sidebar / 2, 34, (sidebar - 16) / 2, () -> selectTab(true));
        }
        search = field("Search friends…", 8, 60, sidebar - 16, searchValue, 64);
        search.setVisible(!statusMenu);
        search.setChangedListener(value -> friendOffset = 0);
        add = field("Add friend…", 8, height - 25, sidebar - 56, addValue, 24);
        button("Add", sidebar - 44, height - 26, 36, this::addFriend);
        draft = null;
        if (target != null && chatWidth >= 100 && chatHeight >= 75) {
            button("×", chatX + chatWidth - 25, chatY + 5, 20, this::closeChat);
            draft = field("Write a message…", chatX + 8, chatY + chatHeight - 25,
                chatWidth - 64, draftValue, 2000);
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
        return addDrawableChild(field);
    }

    private void button(String label, int x, int y, int w, Runnable action) {
        boolean accent = label.equals("Send");
        addDrawableChild(new ButtonWidget(x, y, w, 20, Text.literal(label), b -> action.run(), text -> text.get()) {
            @Override
            protected void renderWidget(DrawContext context, int mouseX, int mouseY, float delta) {
                int background = accent ? (isHovered() ? 0xFFCF389E : 0xFFAD227E)
                    : isHovered() || isFocused() ? 0xFF41465D : 0xFF2B2F40;
                context.fill(getX(), getY(), getRight(), getBottom(), background);
                context.drawBorder(getX(), getY(), getWidth(), getHeight(), BORDER);
                drawScrollableText(context, textRenderer, 4, WHITE);
            }
        });
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
    public void tick() {
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
    public void render(DrawContext ctx, int mouseX, int mouseY, float delta) {
        ctx.fill(0, 0, width, height, 0x43060913);
        ctx.fill(0, 0, sidebar, height, BACKGROUND);
        ctx.fill(sidebar - 1, 0, sidebar, height, BORDER);
        if (client != null && client.player != null)
            PlayerSkinDrawer.draw(ctx, client.player.getSkinTextures(), 8, 8, 19);
        label(ctx, name, 32, 8, sidebar - 112, WHITE);
        label(ctx, statusLabel(status), 32, 20, sidebar - 112, MUTED);
        if (!statusMenu) {
            int tab = requests ? sidebar / 2 : 8;
            ctx.fill(tab, 55, tab + (sidebar - 18) / 2, 57, PINK);
            List<JsonObject> rows = visibleFriends();
            int y = 86;
            for (int i = Math.min(friendOffset, rows.size()); i < rows.size() && y + 25 < height - 43; i++, y += 26) {
                var row = rows.get(i);
                String id = string(row, "account_id");
                String state = string(availability, id);
                if (mouseX >= 8 && mouseX < sidebar - 8 && mouseY >= y && mouseY < y + 25
                    || id.equals(target)) ctx.fill(8, y, sidebar - 8, y + 25, 0xFF292D40);
                int color = switch (state) {
                    case "online" -> 0xFF55D69A;
                    case "away" -> 0xFFFFC36C;
                    case "busy" -> 0xFFFF7985;
                    default -> MUTED;
                };
                PlayerSkinDrawer.draw(ctx, DefaultSkinHelper.getSkinTextures(UUID.fromString(id)), 10, y + 4, 17);
                ctx.fill(sidebar - 17, y + 9, sidebar - 12, y + 14, color);
                label(ctx, string(row, "display_name"), 32, y + 3, sidebar - 52, WHITE);
                if (requests) {
                    label(ctx, "Accept", 32, y + 14, sidebar / 2 - 18, 0xFF55D69A);
                    label(ctx, "Decline", sidebar * 65 / 100, y + 14, sidebar / 3, MUTED);
                } else {
                    label(ctx, state.isEmpty() ? "Offline" : statusLabel(state),
                        32, y + 14, sidebar - 52, MUTED);
                }
            }
        }
        if (target != null && draft != null) renderChat(ctx);
        else if (target != null) label(ctx, "Increase window size to open chat.", 8, height - 39, sidebar - 16, MUTED);
        String feedback = error.isEmpty() ? notice : error;
        if (!feedback.isEmpty()) label(ctx, feedback, 8, height - 39, sidebar - 16, error.isEmpty() ? MUTED : 0xFFFFA3A9);
        super.render(ctx, mouseX, mouseY, delta);
    }

    private void renderChat(DrawContext ctx) {
        int right = chatX + chatWidth, bottom = chatY + chatHeight;
        ctx.fill(chatX, chatY, right, bottom, BACKGROUND);
        ctx.drawBorder(chatX, chatY, chatWidth, chatHeight, BORDER);
        ctx.fill(chatX + 1, chatY + 30, right - 1, chatY + 31, BORDER);
        ctx.fill(chatX + 1, bottom - 43, right - 1, bottom - 42, BORDER);
        label(ctx, targetName, chatX + 10, chatY + 11, chatWidth - 42, WHITE);
        ctx.enableScissor(chatX + 8, chatY + 34, right - 8, bottom - 41);
        int y = bottom - 45;
        for (int i = Math.min(messageOffset, messages.size()); i < messages.size() && y > chatY + 27; i++) {
            var message = messages.get(i).getAsJsonObject();
            var lines = textRenderer.wrapLines(Text.literal(string(message, "body")), chatWidth - 22);
            y -= lines.size() * 10;
            int rowY = y;
            for (var line : lines) {
                ctx.drawTextWithShadow(textRenderer, line, chatX + 10, rowY, WHITE);
                rowY += 10;
            }
            y -= 17;
            label(ctx, target.equals(string(message, "sender_id")) ? targetName : "You",
                chatX + 10, y + 3, chatWidth - 22, MUTED);
        }
        ctx.disableScissor();
        if (peerTyping) label(ctx, targetName + " is typing…", chatX + 8, bottom - 38, chatWidth - 16, MUTED);
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
        if (super.mouseClicked(x, y, button)) return true;
        if (button != 0 || statusMenu || x < 8 || x >= sidebar - 8 || y < 86 || y >= height - 43) return false;
        int i = (int) (y - 86) / 26 + friendOffset;
        var rows = visibleFriends();
        if (i >= rows.size() || 86 + (i - friendOffset) * 26 + 25 >= height - 43) return false;
        var row = rows.get(i);
        String id = string(row, "account_id");
        if (requests) {
            request(x < sidebar * 0.65 ? "accept" : "decline", args("target", id), ignored -> nextFriends = 0);
        } else {
            closeChat();
            target = id;
            targetName = string(row, "display_name");
            rebuild();
            history(id);
        }
        return true;
    }

    @Override
    public boolean mouseScrolled(double x, double y, double horizontal, double vertical) {
        if (x < sidebar && y >= 86 && y < height - 43) {
            friendOffset = Math.clamp(friendOffset + (vertical < 0 ? 1 : -1), 0, Math.max(0, visibleFriends().size() - 1));
            return true;
        }
        if (target != null && x >= chatX && x < chatX + chatWidth) {
            messageOffset = Math.clamp(messageOffset + (vertical > 0 ? 1 : -1), 0, Math.max(0, messages.size() - 1));
            return true;
        }
        return super.mouseScrolled(x, y, horizontal, vertical);
    }

    @Override
    public boolean keyPressed(int key, int scan, int modifiers) {
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
