@file:OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)
import kotlinx.cinterop.*
import platform.posix.__error

fun clearErrno() { __error()!!.pointed.value = 0 }
