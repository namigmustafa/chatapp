import Foundation

// Minimal Firestore REST client, authenticated with a Firebase ID token (not
// the native Firebase SDK — see NativeWebRTCPlugin.swift for why). Only
// implements the handful of operations the CallKit-answer path needs:
// read a document, partial-update fields, and add/list subcollection docs.
enum FirestoreClient {
    static let projectId = "chatapp-48786"
    private static var baseURL: String {
        "https://firestore.googleapis.com/v1/projects/\(projectId)/databases/(default)/documents"
    }

    enum ClientError: Error { case noToken, badResponse, http(Int, String) }

    private static func authToken() throws -> String {
        guard let token = UserDefaults.standard.string(forKey: "firebase_id_token"), !token.isEmpty else {
            throw ClientError.noToken
        }
        return token
    }

    private static func request(_ url: URL, method: String, body: Data? = nil) async throws -> Data {
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("Bearer \(try authToken())", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = body
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw ClientError.badResponse }
        guard (200...299).contains(http.statusCode) else {
            throw ClientError.http(http.statusCode, String(data: data, encoding: .utf8) ?? "")
        }
        return data
    }

    /// Fetches a document as a plain [String: Any] (Firestore's typed-value
    /// wrappers already unwrapped) or nil if it doesn't exist.
    static func getDocument(path: String) async throws -> [String: Any]? {
        let url = URL(string: "\(baseURL)/\(path)")!
        do {
            let data = try await request(url, method: "GET")
            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let fields = json["fields"] as? [String: Any] else { return nil }
            return decodeFields(fields)
        } catch ClientError.http(404, _) {
            return nil
        }
    }

    /// Partial update (only the given top-level fields are touched — everything
    /// else on the document is left alone, matching Firestore's `updateDoc`).
    static func updateDocument(path: String, fields: [String: Any]) async throws {
        var urlStr = "\(baseURL)/\(path)?"
        urlStr += fields.keys.map { "updateMask.fieldPaths=\($0)" }.joined(separator: "&")
        let url = URL(string: urlStr)!
        let body = try JSONSerialization.data(withJSONObject: ["fields": encodeFields(fields)])
        _ = try await request(url, method: "PATCH", body: body)
    }

    /// Adds a new document to a subcollection with an auto-generated ID
    /// (mirrors the JS side's `addDoc`).
    static func addDocument(collectionPath: String, fields: [String: Any]) async throws {
        let url = URL(string: "\(baseURL)/\(collectionPath)")!
        let body = try JSONSerialization.data(withJSONObject: ["fields": encodeFields(fields)])
        _ = try await request(url, method: "POST", body: body)
    }

    /// Lists all documents in a subcollection, decoded the same way as getDocument.
    static func listDocuments(collectionPath: String) async throws -> [[String: Any]] {
        let url = URL(string: "\(baseURL)/\(collectionPath)")!
        let data = try await request(url, method: "GET")
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let docs = json["documents"] as? [[String: Any]] else { return [] }
        return docs.compactMap { doc in
            guard let fields = doc["fields"] as? [String: Any] else { return nil }
            var decoded = decodeFields(fields)
            decoded["__name"] = doc["name"] as? String
            return decoded
        }
    }

    // MARK: - Firestore typed-value <-> plain value

    private static func encodeValue(_ value: Any) -> [String: Any] {
        switch value {
        case let v as String: return ["stringValue": v]
        case let v as Bool: return ["booleanValue": v]
        case let v as Int: return ["integerValue": String(v)]
        case let v as Double: return ["doubleValue": v]
        case let v as [String: Any]: return ["mapValue": ["fields": encodeFields(v)]]
        case Optional<Any>.none: return ["nullValue": NSNull()]
        default: return ["stringValue": "\(value)"]
        }
    }

    private static func encodeFields(_ fields: [String: Any]) -> [String: Any] {
        var out: [String: Any] = [:]
        for (k, v) in fields { out[k] = encodeValue(v) }
        return out
    }

    private static func decodeValue(_ wrapped: Any) -> Any? {
        guard let dict = wrapped as? [String: Any] else { return nil }
        if let v = dict["stringValue"] as? String { return v }
        if let v = dict["booleanValue"] as? Bool { return v }
        if let v = dict["integerValue"] as? String { return Int(v) }
        if let v = dict["doubleValue"] as? Double { return v }
        if let map = dict["mapValue"] as? [String: Any], let f = map["fields"] as? [String: Any] {
            return decodeFields(f)
        }
        return nil
    }

    private static func decodeFields(_ fields: [String: Any]) -> [String: Any] {
        var out: [String: Any] = [:]
        for (k, v) in fields { out[k] = decodeValue(v) }
        return out
    }
}
