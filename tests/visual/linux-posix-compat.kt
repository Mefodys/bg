@file:OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)
import kotlinx.cinterop.*
import platform.posix.*

// Compile historical macOS-oriented sources unchanged on Linux. These adapters
// only bridge POSIX binding signatures; discovery and rendering stay unchanged.
internal fun __error(): CPointer<IntVar>? = __errno_location()
internal fun ioctl(fd: Int, request: Int, size: CPointer<winsize>): Int =
    platform.posix.ioctl(fd, request.toULong(), size)
