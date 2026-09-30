@file:OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)
import kotlinx.cinterop.*
import platform.posix.*

private val excluded = setOf(".git", "node_modules", "vendor", ".venv", "venv", "dist", "build", "target", ".idea", ".vscode")
private data class Source(val location: String, val manifest: String)
private data class Skill(
    val name: String, val description: String?, val location: String, val manifest: String,
    val category: String, val content: String?,
    val sources: List<Source> = listOf(Source(location, manifest)), val conflict: Boolean = false,
)

private fun category(location: String): String {
    val parts = location.split('/')
    val tests = setOf("test", "tests", "testData", "test-data", "testdata", "integration-tests", "testFixtures")
    if (parts.any { it in tests } || parts.windowed(2).any {
        it[0] == "src" && (it[1] in setOf("test", "testFixtures") || it[1].matches(Regex("[A-Za-z0-9_-]+Test")))
    }) return "test-fixture"
    val productPrefix = "plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills"
    if (location == productPrefix || location.startsWith("$productPrefix/")) return "product"
    return "development"
}

private fun logicalSkills(discovered: List<Skill>): List<Skill> {
    val result = mutableListOf<Skill>()
    val consumed = mutableSetOf<String>()
    for (skill in discovered.sortedBy { it.manifest }) {
        if (skill.manifest in consumed) continue
        val mirror = if (skill.category == "development" && skill.location.startsWith(".agents/skills/"))
            discovered.firstOrNull {
                it.location == ".claude/skills/" + skill.location.removePrefix(".agents/skills/") &&
                    it.name == skill.name && it.content != null && it.content == skill.content && it.category == skill.category
            } else null
        if (mirror != null) {
            consumed.add(mirror.manifest)
            result.add(skill.copy(sources = listOf(Source(skill.location, skill.manifest), Source(mirror.location, mirror.manifest))))
        } else result.add(skill)
    }
    return result.map { skill -> skill.copy(conflict = result.any {
        it.manifest != skill.manifest && it.category == skill.category && it.name == skill.name &&
            it.content != null && skill.content != null && it.content != skill.content
    }) }
}

private fun section(skill: Skill): String = when (skill.category) {
    "test-fixture" -> "@test-fixtures"
    "product" -> "@product"
    else -> if (skill.location == ".") "." else skill.location.substringBefore('/')
}

private fun sectionName(section: String): String = when (section) {
    "@test-fixtures" -> "Test fixtures"
    "@product" -> "Product skills"
    else -> section
}

private fun unquote(value: String): String = buildString {
    var i = 0
    while (i < value.length) {
        val c = value[i++]
        if (c != '\\' || i == value.length) { append(c); continue }
        when (val next = value[i++]) {
            'n' -> append('\n')
            'r' -> append('\r')
            't' -> append('\t')
            '"', '\\', '/' -> append(next)
            'u' -> {
                val hex = value.substring(i, minOf(i + 4, value.length)).toIntOrNull(16)
                if (hex != null && i + 4 <= value.length) { append(hex.toChar()); i += 4 }
                else append("\\u")
            }
            else -> append('\\').append(next)
        }
    }
}

private fun metadata(lines: List<String>): Map<String, String> {
    val result = mutableMapOf<String, String>()
    if (lines.firstOrNull()?.trim() != "---") return result
    val end = (1 until lines.size).firstOrNull { lines[it].trim() in setOf("---", "...") } ?: return result
    var i = 1
    while (i < end) {
        val match = Regex("^(name|description):\\s*(.*)$").find(lines[i++]) ?: continue
        val key = match.groupValues[1]
        var value = match.groupValues[2]
        if (value in setOf("|", ">", "|-", ">-", "|+", ">+")) {
            val parts = mutableListOf<String>()
            while (i < end && (lines[i].isBlank() || lines[i].first().isWhitespace())) parts.add(lines[i++].trim())
            value = parts.joinToString(" ")
        } else if (value.startsWith('"') && value.endsWith('"')) value = unquote(value.substring(1, value.length - 1))
        else if (value.startsWith('\'') && value.endsWith('\'')) value = value.substring(1, value.length - 1).replace("''", "'")
        else if (value.firstOrNull() in listOf('!', '&', '*', '[', '{')) continue
        else value = value.split(Regex("\\s+#"), limit = 2)[0]
        value = value.trim().replace(Regex("\\s+"), " ")
        if (value.isNotEmpty()) result[key] = value
    }
    return result
}

private fun parse(content: String, fallback: String): Pair<String, String?> {
    val lines = content.lines()
    val meta = metadata(lines)
    var frontMatter = lines.firstOrNull()?.trim() == "---"
    var fence: String? = null
    var name = fallback
    var index: Int? = null
    for ((i, line) in lines.withIndex()) {
        val stripped = line.trim()
        if (frontMatter) {
            if (i > 0 && stripped in setOf("---", "...")) frontMatter = false
            continue
        }
        val activeFence = fence
        if (activeFence != null) {
            if (stripped.length >= activeFence.length && stripped.all { it == activeFence[0] }) fence = null
            continue
        }
        val opening = Regex("^ {0,3}(`{3,}|~{3,})").find(line)
        if (opening != null) { fence = opening.groupValues[1]; continue }
        val match = Regex("^ {0,3}#\\s+(.+?)\\s*#*\\s*$").find(line)
        if (match != null) { name = match.groupValues[1].trim().ifEmpty { fallback }; index = i; break }
    }
    val paragraph = mutableListOf<String>()
    if (index != null) for (line in lines.drop(index + 1)) {
        val stripped = line.trim()
        if (stripped.isEmpty()) { if (paragraph.isNotEmpty()) break else continue }
        if (Regex("^(?:#{1,6}(?:\\s|$)|[-+*]\\s|\\d+[.)]\\s|>|```|~~~|[-*_]{3,}\\s*$)").containsMatchIn(stripped) || line.startsWith("    ") || line.startsWith('\t')) break
        paragraph.add(stripped)
    }
    val description = (meta["description"] ?: paragraph.joinToString(" ")).trim().replace(Regex("\\s+"), " ")
    val chars = mutableListOf<String>()
    var i = 0
    while (i < description.length) {
        val size = if (description[i].isHighSurrogate() && i + 1 < description.length && description[i + 1].isLowSurrogate()) 2 else 1
        chars.add(description.substring(i, i + size)); i += size
    }
    val short = if (chars.size > 240) chars.take(237).joinToString("").trimEnd() + "..." else description
    return (meta["name"] ?: name) to short.ifEmpty { null }
}

private fun quote(text: String): String = buildString {
    append('"')
    for (c in text) when (c) {
        '"' -> append("\\\"")
        '\\' -> append("\\\\")
        '\n' -> append("\\n")
        '\r' -> append("\\r")
        '\t' -> append("\\t")
        else -> if (c.code < 32) append("\\u" + c.code.toString(16).padStart(4, '0')) else append(c)
    }
    append('"')
}

private fun fileMode(path: String): Int? = memScoped {
    val info = alloc<stat>()
    if (lstat(path, info.ptr) != 0) null else info.st_mode.toInt() and S_IFMT
}

private fun readManifest(path: String): String {
    val file = fopen(path, "rb") ?: error(strerror(errno)?.toKString() ?: "Cannot open file")
    try {
        val bytes = mutableListOf<Byte>()
        val buffer = ByteArray(8192)
        buffer.usePinned { pinned ->
            while (true) {
                val count = fread(pinned.addressOf(0), 1u, buffer.size.toULong(), file).toInt()
                for (i in 0 until count) bytes.add(buffer[i])
                if (count < buffer.size) {
                    if (ferror(file) != 0) error("Cannot read file")
                    break
                }
            }
        }
        return bytes.toByteArray().decodeToString(throwOnInvalidSequence = true)
    } finally { fclose(file) }
}

private fun visible(text: String): String = text.map { if (it.code < 32 || it.code in 127..159) ' ' else it }.joinToString("")

private fun compact(text: String, width: Int): String {
    val clean = visible(text)
    if (clean.length <= width) return clean
    val prefix = clean.take(width - 1)
    val space = prefix.lastIndexOf(' ')
    return (if (space > width / 2) prefix.take(space) else prefix).trimEnd() + "…"
}

private fun fileUri(path: String): String = "file://" + path.encodeToByteArray().joinToString("") {
    val byte = it.toInt() and 255
    if (byte in 65..90 || byte in 97..122 || byte in 48..57 || byte.toChar() in "/-._~") byte.toChar().toString()
    else "%" + byte.toString(16).uppercase().padStart(2, '0')
}

private class Terminal {
    private val interactive = isatty(STDOUT_FILENO) == 1 && getenv("TERM")?.toKString() != "dumb"
    private val color = interactive && getenv("NO_COLOR") == null
    val width: Int = memScoped {
        val size = alloc<winsize>()
        val columns = if (interactive && ioctl(STDOUT_FILENO, TIOCGWINSZ, size.ptr) == 0) size.ws_col.toInt() else 0
        (columns.takeIf { it > 0 } ?: getenv("COLUMNS")?.toKString()?.toIntOrNull() ?: 100).coerceIn(40, 160)
    }
    fun paint(text: String, code: String): String = if (color) "\u001b[${code}m$text\u001b[0m" else text
    fun link(path: String): String {
        val label = paint("SKILL.md ↗", "36")
        return if (interactive) "\u001b]8;;${fileUri(path)}\u001b\\$label\u001b]8;;\u001b\\" else label
    }
}

private fun wrap(text: String, width: Int = 84): String {
    val lines = mutableListOf<String>()
    var line = ""
    for (word in text.split(Regex("\\s+"))) {
        if (line.isNotEmpty() && line.length + word.length + 1 > width) {
            lines.add(line); line = ""
        }
        line = if (line.isEmpty()) word else "$line $word"
    }
    if (line.isNotEmpty()) lines.add(line)
    return lines.joinToString("\n") { "    $it" }
}

private fun scan(root: String, json: Boolean): String {
    val discovered = mutableListOf<Skill>()
    val warnings = mutableListOf<String>()
    val pending = mutableListOf(".")
    while (pending.isNotEmpty()) {
        val relative = pending.removeAt(pending.lastIndex)
        val path = if (relative == ".") root else "$root/$relative"
        val directory = opendir(path)
        if (directory == null) {
            warnings.add("$relative: ${strerror(errno)?.toKString() ?: "Cannot read directory"}")
            continue
        }
        try {
            while (true) {
                __error()!!.pointed.value = 0
                val entry = readdir(directory)
                if (entry == null) {
                    if (errno != 0) warnings.add("$relative: ${strerror(errno)?.toKString()}")
                    break
                }
                val name = entry.pointed.d_name.toKString()
                if (name == "." || name == "..") continue
                val location = if (relative == ".") name else "$relative/$name"
                val full = if (root == "/") "/$location" else "$root/$location"
                val mode = fileMode(full)
                if (mode == null) {
                    warnings.add("$location: ${strerror(errno)?.toKString() ?: "Cannot inspect entry"}")
                    continue
                }
                if (mode == S_IFDIR && name !in excluded) pending.add(location)
                if (mode != S_IFREG || name != "SKILL.md") continue
                var skillName = path.substringAfterLast('/').ifEmpty { "/" }
                var description: String? = null
                var content: String? = null
                try {
                    content = readManifest(full).replace("\r\n", "\n").replace('\r', '\n')
                    val fields = parse(content, skillName)
                    skillName = fields.first; description = fields.second
                } catch (error: Exception) { warnings.add("$location: ${error.message ?: "Cannot read manifest"}") }
                discovered.add(Skill(skillName, description, relative, location, category(relative), content))
            }
        } finally { closedir(directory) }
    }
    val skills = logicalSkills(discovered)
    val sections = skills.groupBy(::section)
    if (!json) return buildString {
        val terminal = Terminal()
        append(terminal.paint("\n  SKILL ATLAS", "1;36"))
        append(terminal.paint("  ·  repository skills\n", "2"))
        append("\n  ${terminal.paint(visible(root.substringAfterLast('/').ifEmpty { root }), "1")}  ")
        append(terminal.paint("${skills.size} skills", "32"))
        append(terminal.paint("  ·  ${sections.size} sections\n", "2"))
        append(terminal.paint("  ${visible(root)}\n", "2"))
        append(terminal.paint("  " + "─".repeat(terminal.width - 4) + "\n", "2"))
        if (skills.isEmpty()) append("\nNo skills found.\n")
        for (section in sections.keys.sorted()) {
            val entries = sections.getValue(section).sortedBy { it.manifest }
            append("\n  ${terminal.paint("[${visible(sectionName(section))}]", "1;35")}  ${terminal.paint("${entries.size} skills", "2")}\n")
            for ((i, skill) in entries.withIndex()) {
                val prefix = "  ${(i + 1).toString().padStart(2)} › "
                val name = compact(skill.name, terminal.width - prefix.length - 14)
                val gap = " ".repeat((terminal.width - prefix.length - name.length - 12).coerceAtLeast(2))
                append("\n${terminal.paint(prefix, "2")}${terminal.paint(name, "1;36")}$gap${terminal.link("$root/${skill.manifest}")}\n")
                append(terminal.paint(wrap(compact(skill.description ?: "No description available.", terminal.width - 8), terminal.width - 8), "37"))
                append("\n${terminal.paint("    ${visible(skill.location)}", "2")}\n")
                for (source in skill.sources.drop(1)) append(terminal.paint("    Also: ${visible(source.location)}\n", "2"))
                if (skill.conflict) append(terminal.paint("    ⚠ Conflicting variant: same name, different manifest\n", "33"))
            }
        }
        if (warnings.isNotEmpty()) {
            append("\nWarnings:\n")
            for (warning in warnings.sorted()) append("  - $warning\n")
        }
    }.trimEnd()
    return buildString {
        append("{\n  \"repository\": ${quote(root)},\n  \"sections\": [")
        append(sections.keys.sorted().joinToString(",") { section ->
            "\n    {\"name\": ${quote(sectionName(section))}, \"path\": ${quote(section)}, \"skills\": [" +
                sections.getValue(section).sortedBy { it.manifest }.joinToString(",") { skill ->
                    "\n      {\"name\": ${quote(skill.name)}, \"description\": ${skill.description?.let(::quote) ?: "null"}, " +
                        "\"location\": ${quote(skill.location)}, \"manifest_path\": ${quote(skill.manifest)}, " +
                        "\"category\": ${quote(skill.category)}, \"conflict\": ${skill.conflict}, \"sources\": [" +
                        skill.sources.joinToString(", ") { "{\"location\": ${quote(it.location)}, \"manifest_path\": ${quote(it.manifest)}}" } + "]}"
                } + "\n    ]}"
        })
        append("\n  ],\n  \"warnings\": [${warnings.sorted().joinToString(", ", transform = ::quote)}]\n}")
    }
}

private fun diagnostic(message: String) { fputs("$message\n", stderr) }

fun main(args: Array<String>) {
    if (args.toList() == listOf("--help")) {
        println("Usage: bg scan <repository-path> [--json]\nScan a repository for agent skills grouped by directory.\nCommands: scan <repository-path>, --help, --version\nDefault output: readable sectioned list. Use --json for machine-readable output.")
        return
    }
    if (args.toList() == listOf("--version")) { println("bg 0.1.0"); return }
    val json = args.size == 3 && args[2] == "--json"
    if ((args.size != 2 && !json) || args[0] != "scan") {
        diagnostic("Error: expected scan, one repository path, and optional --json.\nUsage: bg scan <repository-path> [--json]")
        exit(2)
    }
    try {
        val resolved = realpath(args[1], null)
        val root = if (resolved != null) resolved.toKString().also { free(resolved) } else null
        if (root == null || fileMode(root) != S_IFDIR) {
            diagnostic("Error: repository path is not an existing directory: ${args[1]}")
            exit(3)
        }
        println(scan(root!!, json))
    } catch (error: Exception) {
        diagnostic("Error: scan failed: ${error.message}")
        exit(4)
    }
}
