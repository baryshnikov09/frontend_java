package com.example.student;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.TestExecutionListeners;
import org.springframework.test.context.support.DependencyInjectionTestExecutionListener;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestExecutionListeners(DependencyInjectionTestExecutionListener.class)
class ApplicationIntegrationTest {
    @LocalServerPort
    private int port;
    private final HttpClient client = HttpClient.newHttpClient();
    private String admin;
    private String teacher;
    private String superAdmin;

    @BeforeEach
    void setUp() throws Exception {
        admin = login("admin@example.com", "admin");
        teacher = login("teacher@example.com", "teacher");
        superAdmin = login("superadmin@example.com", "superAdmin");}

    private HttpResponse<String> request(String method, String path, String token, String body) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
        if (token != null) builder.header("Authorization", "Bearer " + token);
        if (body != null) builder.header("Content-Type", "application/json");
        builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());}

    private String login(String email, String password) throws Exception {
        HttpResponse<String> response = request("POST", "/api/v1/auth/login", null,
                "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}");
        assertEquals(200, response.statusCode());
        Matcher matcher = Pattern.compile("\"token\"\\s*:\\s*\"([^\"]+)\"").matcher(response.body());
        assertTrue(matcher.find());
        return matcher.group(1);}

    private long idFrom(String json) {
        Matcher matcher = Pattern.compile("\"id\"\\s*:\\s*(\\d+)").matcher(json);
        assertTrue(matcher.find(), json);
        return Long.parseLong(matcher.group(1));}

    @Test
    @DisplayName("Администратор управляет студентами")
    void studentOperations() throws Exception {
        String path = "/api/v1/student";
        var created = request("POST", path + "/save", admin,
                "{\"name\":\"Ivan\",\"surname\":\"Petrov\",\"email\":\"ivan@example.com\",\"phone_number\":\"12345\"}");
        assertEquals(200, created.statusCode());
        long id = idFrom(created.body());

        var list = request("GET", path, teacher, null);
        assertEquals(200, list.statusCode());
        assertTrue(list.body().contains("Petrov"));

        var student = request("GET", path + "/" + id, teacher, null);
        assertEquals(200, student.statusCode());
        assertTrue(student.body().contains("ivan@example.com"));
        assertEquals(200, request("GET", path + "/info/" + id, admin, null).statusCode());

        var updated = request("PUT", path + "/" + id, admin,
                "{\"email\":\"new@example.com\",\"phoneNumber\":\"777\"}");
        assertEquals(200, updated.statusCode());
        var afterUpdate = request("GET", path + "/" + id, admin, null);
        assertTrue(afterUpdate.body().contains("new@example.com"));
        assertTrue(afterUpdate.body().contains("777"));

        assertEquals(200, request("DELETE", path + "/" + id, admin, null).statusCode());
        assertEquals(404, request("GET", path + "/" + id, admin, null).statusCode());}

    @Test
    @DisplayName("Проверка доступа к студентам")
    void studentAccess() throws Exception {
        String path = "/api/v1/student";
        assertEquals(403, request("POST", path + "/save", teacher, "{} ").statusCode());
        assertEquals(403, request("DELETE", path + "/1", teacher, null).statusCode());
        assertEquals(403, request("GET", path, superAdmin, null).statusCode());
        assertTrue(request("GET", path, null, null).statusCode() >= 400);
        assertEquals(401, request("GET", path, "invalid-token", null).statusCode());}

    @Test
    @DisplayName("Суперадминистратор управляет пользователями")
    void userOperations() throws Exception {
        String path = "/api/v1/users";
        var created = request("POST", path + "/save", superAdmin,
                "{\"email\":\"newuser@example.com\",\"password\":\"secret\",\"roles\":[\"TEACHER\"]}");
        assertEquals(200, created.statusCode());
        long id = idFrom(created.body());
        var list = request("GET", path, superAdmin, null);
        assertEquals(200, list.statusCode());
        assertTrue(list.body().contains("newuser@example.com"));
        assertFalse(list.body().contains("secret"));
        assertEquals(409, request("POST", path + "/save", superAdmin,
                "{\"email\":\"newuser@example.com\",\"password\":\"secret\",\"roles\":[\"TEACHER\"]}").statusCode());
        var updated = request("PUT", path + "/" + id, superAdmin,
                "{\"email\":\"updated@example.com\",\"password\":\"\",\"roles\":[\"ADMIN\"]}");
        assertEquals(200, updated.statusCode());
        assertTrue(updated.body().contains("updated@example.com"));
        assertTrue(updated.body().contains("ADMIN"));
        assertEquals(200, request("DELETE", path + "/" + id, superAdmin, null).statusCode());
        assertFalse(request("GET", path, superAdmin, null).body().contains("updated@example.com"));}

    @Test
    @DisplayName("Проверка доступа и ошибок входа")
    void userAccessAndErrors() throws Exception {
        assertEquals(403, request("GET", "/api/v1/users", admin, null).statusCode());
        assertEquals(401, request("POST", "/api/v1/auth/login", null,
                "{\"email\":\"admin@example.com\",\"password\":\"wrong\"}").statusCode());
        assertEquals(400, request("POST", "/api/v1/auth/login", null,
                "{\"email\":\"invalid\",\"password\":\"\"}").statusCode());
        assertEquals(404, request("PUT", "/api/v1/users/999999", superAdmin,
                "{\"email\":\"missing@example.com\",\"roles\":[\"ADMIN\"]}").statusCode());}}
