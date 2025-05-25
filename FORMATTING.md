# Document Formatting Support

This Language Server provides full document formatting support for Groovy files.

## Supported Features

- **Document Formatting** (`textDocument/formatting`) - Format an entire document
- **Range Formatting** (`textDocument/rangeFormatting`) - Format a selected range

## Implementation Details

### Core Classes

1. **DocumentFormattingProvider** (`src/main/java/net/prominic/groovyls/providers/DocumentFormattingProvider.java`)
   - Implements the formatting logic
   - Handles both full document and range formatting
   - Preserves string literals, regex patterns, and GStrings

2. **GroovyServices** (`src/main/java/net/prominic/groovyls/GroovyServices.java`)
   - Implements LSP handlers for formatting requests
   - Methods: `formatting()` and `rangeFormatting()`

3. **GroovyLanguageServer** (`src/main/java/net/prominic/groovyls/GroovyLanguageServer.java`)
   - Enables formatting capabilities in server initialization

## Formatting Rules

The formatter applies the following rules:

### Spacing
- Adds spaces around operators (`=`, `==`, `!=`, `<`, `>`, etc.)
- Adds spaces after commas and semicolons
- Adds spaces around closure arrows (`->`)
- Preserves safe navigation operator without spaces (`?.`)
- Adds spaces around Elvis operator (`?:`)

### Indentation
- Configurable via `FormattingOptions`:
  - `tabSize`: Number of spaces per indent level
  - `insertSpaces`: Use spaces (true) or tabs (false)

### Special Handling
- Preserves string literal contents (single, double, triple quotes)
- Preserves regex patterns
- Preserves GString interpolations (`${...}`)
- Handles Groovy-specific syntax (closures, safe navigation, spread operator)

## Testing

Comprehensive tests are available in:
`src/test/java/net/prominic/groovyls/GroovyServicesFormattingTests.java`

Test coverage includes:
- Simple class formatting
- Import statements
- Range formatting
- Tab vs space indentation
- String literal preservation
- Closure formatting
- GString handling
- Safe navigation and Elvis operators
- Map literals

## Usage in VS Code

The formatting is automatically available in VS Code when using this Language Server:
- **Format Document**: `Shift+Alt+F` (Windows/Linux) or `Shift+Option+F` (macOS)
- **Format Selection**: Select text and use the same shortcut
- **Format on Save**: Enable in VS Code settings

## Configuration

VS Code formatting settings are respected:
```json
{
  "editor.tabSize": 4,
  "editor.insertSpaces": true
}
```