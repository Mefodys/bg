@file:OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)
import kotlinx.cinterop.*
import platform.posix.__errno_location

fun clearErrno() { __errno_location()!!.pointed.value = 0 }
