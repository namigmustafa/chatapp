package app.chatapp.calltest

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

// CallTestService runs in its own process lifecycle detached from the UI;
// without this, connect/publish/failure events only went to Logcat, which is
// why "Start call" looked like it did "nothing at all" (the exact same class
// of bug the iOS test app had before its status was wired to the UI).
object CallStatus {
    private val _state = MutableStateFlow("Idle")
    val state = _state.asStateFlow()

    fun update(message: String) {
        _state.value = message
    }
}
