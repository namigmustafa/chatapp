package app.chatapp.p2p

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Minimal Firestore REST client, authenticated with a Firebase ID token (not
 * the native Firebase SDK — mirrors web/native-webrtc's iOS FirestoreClient.swift
 * for the same reason: the native call engine needs to read/write the `calls/{id}`
 * doc without depending on the WebView/JS layer being alive). Only implements
 * what CallForegroundService needs: read a document, partial-update fields.
 */
object FirestoreClient {
    private const val PROJECT_ID = "chatapp-48786"
    private const val BASE_URL = "https://firestore.googleapis.com/v1/projects/$PROJECT_ID/databases/(default)/documents"

    class HttpError(val code: Int, val body: String) : Exception("HTTP $code: $body")

    private fun request(urlString: String, method: String, idToken: String, body: String? = null): String {
        val conn = URL(urlString).openConnection() as HttpURLConnection
        conn.requestMethod = method
        conn.setRequestProperty("Authorization", "Bearer $idToken")
        conn.setRequestProperty("Content-Type", "application/json")
        conn.connectTimeout = 10_000
        conn.readTimeout = 10_000
        if (body != null) {
            conn.doOutput = true
            conn.outputStream.use { it.write(body.toByteArray()) }
        }
        val code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val text = stream?.bufferedReader()?.use { it.readText() } ?: ""
        if (code !in 200..299) throw HttpError(code, text)
        return text
    }

    /** Fetches a document as a plain JSONObject of unwrapped values, or null if 404. */
    fun getDocument(path: String, idToken: String): JSONObject? {
        return try {
            val json = JSONObject(request("$BASE_URL/$path", "GET", idToken))
            val fields = json.optJSONObject("fields") ?: return null
            decodeFields(fields)
        } catch (e: HttpError) {
            if (e.code == 404) null else throw e
        }
    }

    /** Partial update — only the given top-level fields are touched. */
    fun updateDocument(path: String, fields: Map<String, Any?>, idToken: String) {
        val mask = fields.keys.joinToString("&") { "updateMask.fieldPaths=$it" }
        val body = JSONObject().put("fields", encodeFields(fields)).toString()
        request("$BASE_URL/$path?$mask", "PATCH", idToken, body)
    }

    // MARK: - Firestore typed-value <-> plain value

    private fun encodeValue(value: Any?): JSONObject = when (value) {
        is String -> JSONObject().put("stringValue", value)
        is Boolean -> JSONObject().put("booleanValue", value)
        is Int -> JSONObject().put("integerValue", value.toString())
        is Double -> JSONObject().put("doubleValue", value)
        null -> JSONObject().put("nullValue", JSONObject.NULL)
        else -> JSONObject().put("stringValue", value.toString())
    }

    private fun encodeFields(fields: Map<String, Any?>): JSONObject {
        val out = JSONObject()
        for ((k, v) in fields) out.put(k, encodeValue(v))
        return out
    }

    private fun decodeValue(wrapped: JSONObject): Any? = when {
        wrapped.has("stringValue") -> wrapped.getString("stringValue")
        wrapped.has("booleanValue") -> wrapped.getBoolean("booleanValue")
        wrapped.has("integerValue") -> wrapped.getString("integerValue").toIntOrNull()
        wrapped.has("doubleValue") -> wrapped.getDouble("doubleValue")
        wrapped.has("mapValue") -> decodeFields(wrapped.getJSONObject("mapValue").optJSONObject("fields") ?: JSONObject())
        else -> null
    }

    private fun decodeFields(fields: JSONObject): JSONObject {
        val out = JSONObject()
        for (key in fields.keys()) {
            out.put(key, decodeValue(fields.getJSONObject(key)))
        }
        return out
    }
}
