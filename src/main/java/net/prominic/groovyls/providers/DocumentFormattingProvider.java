////////////////////////////////////////////////////////////////////////////////
// Copyright 2022 Prominic.NET, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License
//
// Author: Prominic.NET, Inc.
// No warranty of merchantability or fitness of any kind.
// Use this software at your own risk.
////////////////////////////////////////////////////////////////////////////////
package net.prominic.groovyls.providers;

import java.io.StringWriter;
import java.net.URI;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CompletableFuture;

import org.codehaus.groovy.ast.ModuleNode;
import org.codehaus.groovy.control.SourceUnit;
import org.eclipse.lsp4j.FormattingOptions;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.TextDocumentIdentifier;
import org.eclipse.lsp4j.TextEdit;

import net.prominic.groovyls.compiler.ast.ASTNodeVisitor;
import net.prominic.groovyls.util.FileContentsTracker;

public class DocumentFormattingProvider {
    private FileContentsTracker fileContentsTracker;
    private ASTNodeVisitor astVisitor;
    
    public DocumentFormattingProvider(FileContentsTracker fileContentsTracker, ASTNodeVisitor astVisitor) {
        this.fileContentsTracker = fileContentsTracker;
        this.astVisitor = astVisitor;
    }
    
    public CompletableFuture<List<? extends TextEdit>> provideFormatting(
            TextDocumentIdentifier textDocument, FormattingOptions options) {
        URI uri = URI.create(textDocument.getUri());
        String content = fileContentsTracker.getContents(uri);
        
        if (content == null || content.isEmpty()) {
            return CompletableFuture.completedFuture(Collections.emptyList());
        }
        
        try {
            String formattedContent = formatGroovyCode(content, options);
            
            if (formattedContent.equals(content)) {
                return CompletableFuture.completedFuture(Collections.emptyList());
            }
            
            // Calculate the range for the entire document
            String[] lines = content.split("\n", -1);
            int lastLine = Math.max(0, lines.length - 1);
            int lastColumn = lines[lastLine].length();
            
            Range range = new Range(
                new Position(0, 0),
                new Position(lastLine, lastColumn)
            );
            
            TextEdit edit = new TextEdit(range, formattedContent);
            List<TextEdit> edits = new ArrayList<>();
            edits.add(edit);
            
            return CompletableFuture.completedFuture(edits);
        } catch (Exception e) {
            // If formatting fails, return empty list
            return CompletableFuture.completedFuture(Collections.emptyList());
        }
    }
    
    public CompletableFuture<List<? extends TextEdit>> provideRangeFormatting(
            TextDocumentIdentifier textDocument, Range range, FormattingOptions options) {
        URI uri = URI.create(textDocument.getUri());
        String content = fileContentsTracker.getContents(uri);
        
        if (content == null || content.isEmpty()) {
            return CompletableFuture.completedFuture(Collections.emptyList());
        }
        
        try {
            // Extract the content within the range
            String[] lines = content.split("\n", -1);
            StringBuilder rangeContent = new StringBuilder();
            StringBuilder beforeRange = new StringBuilder();
            StringBuilder afterRange = new StringBuilder();
            
            for (int i = 0; i < lines.length; i++) {
                if (i < range.getStart().getLine()) {
                    beforeRange.append(lines[i]);
                    if (i < lines.length - 1) {
                        beforeRange.append("\n");
                    }
                } else if (i > range.getEnd().getLine()) {
                    afterRange.append("\n");
                    afterRange.append(lines[i]);
                } else if (i == range.getStart().getLine() && i == range.getEnd().getLine()) {
                    // Range is within a single line
                    beforeRange.append(lines[i].substring(0, range.getStart().getCharacter()));
                    rangeContent.append(lines[i].substring(range.getStart().getCharacter(), range.getEnd().getCharacter()));
                    afterRange.append(lines[i].substring(range.getEnd().getCharacter()));
                } else if (i == range.getStart().getLine()) {
                    beforeRange.append(lines[i].substring(0, range.getStart().getCharacter()));
                    rangeContent.append(lines[i].substring(range.getStart().getCharacter()));
                    if (i < range.getEnd().getLine()) {
                        rangeContent.append("\n");
                    }
                } else if (i == range.getEnd().getLine()) {
                    rangeContent.append(lines[i].substring(0, range.getEnd().getCharacter()));
                    afterRange.append(lines[i].substring(range.getEnd().getCharacter()));
                } else {
                    rangeContent.append(lines[i]);
                    if (i < range.getEnd().getLine()) {
                        rangeContent.append("\n");
                    }
                }
            }
            
            String formattedRangeContent = formatGroovyCode(rangeContent.toString(), options);
            
            if (formattedRangeContent.equals(rangeContent.toString())) {
                return CompletableFuture.completedFuture(Collections.emptyList());
            }
            
            TextEdit edit = new TextEdit(range, formattedRangeContent);
            List<TextEdit> edits = new ArrayList<>();
            edits.add(edit);
            
            return CompletableFuture.completedFuture(edits);
        } catch (Exception e) {
            return CompletableFuture.completedFuture(Collections.emptyList());
        }
    }
    
    private String formatGroovyCode(String code, FormattingOptions options) {
        try {
            GroovyCodeFormatter formatter = new GroovyCodeFormatter(options);
            return formatter.format(code);
        } catch (Exception e) {
            // Return original code if formatting fails
            return code;
        }
    }
    
    private static class GroovyCodeFormatter {
        private FormattingOptions options;
        private String indentString;
        
        public GroovyCodeFormatter(FormattingOptions options) {
            this.options = options;
            if (options.isInsertSpaces()) {
                StringBuilder sb = new StringBuilder();
                for (int i = 0; i < options.getTabSize(); i++) {
                    sb.append(" ");
                }
                this.indentString = sb.toString();
            } else {
                this.indentString = "\t";
            }
        }
        
        public String format(String code) {
            // First, split the code into statements/blocks
            code = splitIntoLines(code);
            
            StringBuilder formatted = new StringBuilder();
            String[] lines = code.split("\n", -1);
            int indentLevel = 0;
            boolean inMultilineComment = false;
            
            for (int lineIndex = 0; lineIndex < lines.length; lineIndex++) {
                String line = lines[lineIndex];
                String trimmed = line.trim();
                
                // Handle multiline comments
                if (trimmed.startsWith("/*")) {
                    inMultilineComment = true;
                }
                
                // Handle empty lines
                if (trimmed.isEmpty()) {
                    if (lineIndex < lines.length - 1) {
                        formatted.append("\n");
                    }
                    continue;
                }
                
                // Decrease indent for closing braces
                if (!inMultilineComment && (trimmed.startsWith("}") || trimmed.startsWith("]") || trimmed.startsWith(")"))) {
                    indentLevel = Math.max(0, indentLevel - 1);
                }
                
                // Add indentation
                for (int i = 0; i < indentLevel; i++) {
                    formatted.append(indentString);
                }
                
                // Format the line content
                String formattedLine = formatLine(trimmed);
                formatted.append(formattedLine);
                
                // Add newline except for last line if original didn't have one
                if (lineIndex < lines.length - 1 || code.endsWith("\n")) {
                    formatted.append("\n");
                }
                
                // Increase indent for opening braces
                if (!inMultilineComment && (formattedLine.endsWith("{") || formattedLine.endsWith("[") || formattedLine.endsWith("("))) {
                    indentLevel++;
                }
                
                // Handle multiline comments
                if (trimmed.endsWith("*/")) {
                    inMultilineComment = false;
                }
            }
            
            return formatted.toString();
        }
        
        private String splitIntoLines(String code) {
            // Split single-line code blocks into multiple lines
            code = code.replaceAll("\\{", "{\n");
            code = code.replaceAll("\\}", "\n}");
            code = code.replaceAll(";", ";\n");
            
            // Clean up multiple newlines
            code = code.replaceAll("\n+", "\n");
            code = code.trim();
            
            return code;
        }
        
        private String formatLine(String line) {
            // Add spaces around braces, parentheses, etc.
            line = line.replaceAll("\\s*\\{\\s*", " {");
            line = line.replaceAll("\\s*\\}\\s*", "}");
            line = line.replaceAll("\\s*\\(\\s*", "(");
            line = line.replaceAll("\\s*\\)\\s*", ")");
            line = line.replaceAll("\\s*=\\s*", " = ");
            
            // Handle method definitions
            line = line.replaceAll("\\)\\{", ") {");
            
            // Handle class definitions
            if (line.startsWith("class")) {
                line = line.replaceAll("class\\s+", "class ");
            }
            
            // Clean up multiple spaces
            line = line.replaceAll("\\s+", " ");
            
            return line.trim();
        }
    }
}