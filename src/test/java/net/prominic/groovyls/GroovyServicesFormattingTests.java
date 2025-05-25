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
package net.prominic.groovyls;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.concurrent.CompletableFuture;

import org.eclipse.lsp4j.DocumentFormattingParams;
import org.eclipse.lsp4j.DocumentRangeFormattingParams;
import org.eclipse.lsp4j.FormattingOptions;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.TextDocumentIdentifier;
import org.eclipse.lsp4j.TextEdit;
import org.eclipse.lsp4j.services.LanguageClient;
import org.eclipse.lsp4j.services.TextDocumentService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import net.prominic.groovyls.config.CompilationUnitFactory;

public class GroovyServicesFormattingTests {
    private static final String LANGUAGE_GROOVY = "groovy";
    
    private GroovyServices services;
    private Path workspaceRoot;
    
    @BeforeEach
    void setup() {
        workspaceRoot = Paths.get(System.getProperty("user.dir")).resolve("src/test/java/net/prominic/groovyls");
        services = new GroovyServices(new CompilationUnitFactory());
        services.connect(new LanguageClient() {
            @Override
            public void logMessage(org.eclipse.lsp4j.MessageParams params) {
            }
            
            @Override
            public void publishDiagnostics(org.eclipse.lsp4j.PublishDiagnosticsParams params) {
            }
            
            @Override
            public void showMessage(org.eclipse.lsp4j.MessageParams params) {
            }
            
            @Override
            public CompletableFuture<org.eclipse.lsp4j.MessageActionItem> showMessageRequest(
                    org.eclipse.lsp4j.ShowMessageRequestParams params) {
                return null;
            }
            
            @Override
            public void telemetryEvent(Object params) {
            }
        });
        services.setWorkspaceRoot(workspaceRoot);
    }
    
    @AfterEach
    void tearDown() {
        services = null;
        workspaceRoot = null;
    }
    
    @Test
    void testFormatDocument_SimpleClass() throws Exception {
        String uri = workspaceRoot.resolve("TestFormatting.groovy").toUri().toString();
        String unformattedContent = "class   TestClass{def    method(){return   42}}";
        
        // Open document with unformatted content
        services.didOpen(new org.eclipse.lsp4j.DidOpenTextDocumentParams(
            new org.eclipse.lsp4j.TextDocumentItem(uri, LANGUAGE_GROOVY, 1, unformattedContent)
        ));
        
        DocumentFormattingParams params = new DocumentFormattingParams();
        params.setTextDocument(new TextDocumentIdentifier(uri));
        
        FormattingOptions options = new FormattingOptions();
        options.setTabSize(4);
        options.setInsertSpaces(true);
        params.setOptions(options);
        
        CompletableFuture<List<? extends TextEdit>> future = services.formatting(params);
        List<? extends TextEdit> edits = future.get();
        
        assertNotNull(edits);
        assertEquals(1, edits.size());
        
        TextEdit edit = edits.get(0);
        assertEquals(new Position(0, 0), edit.getRange().getStart());
        assertEquals(new Position(0, 47), edit.getRange().getEnd());
        
        String expectedFormatted = "class TestClass {\n    def method() {\n        return 42\n    }\n}";
        assertEquals(expectedFormatted, edit.getNewText());
    }
    
    @Test
    void testFormatDocument_WithImports() throws Exception {
        String uri = workspaceRoot.resolve("TestFormattingImports.groovy").toUri().toString();
        String unformattedContent = "import java.util.List\nimport java.util.Map\n\n\nclass TestClass{List<String> items=[]}";
        
        services.didOpen(new org.eclipse.lsp4j.DidOpenTextDocumentParams(
            new org.eclipse.lsp4j.TextDocumentItem(uri, LANGUAGE_GROOVY, 1, unformattedContent)
        ));
        
        DocumentFormattingParams params = new DocumentFormattingParams();
        params.setTextDocument(new TextDocumentIdentifier(uri));
        
        FormattingOptions options = new FormattingOptions();
        options.setTabSize(4);
        options.setInsertSpaces(true);
        params.setOptions(options);
        
        CompletableFuture<List<? extends TextEdit>> future = services.formatting(params);
        List<? extends TextEdit> edits = future.get();
        
        assertNotNull(edits);
        assertTrue(edits.size() > 0);
    }
    
    @Test
    void testFormatDocumentRange() throws Exception {
        String uri = workspaceRoot.resolve("TestRangeFormatting.groovy").toUri().toString();
        String content = "class TestClass {\n    def method1(){return 1}\n    def method2(){return 2}\n}";
        
        services.didOpen(new org.eclipse.lsp4j.DidOpenTextDocumentParams(
            new org.eclipse.lsp4j.TextDocumentItem(uri, LANGUAGE_GROOVY, 1, content)
        ));
        
        DocumentRangeFormattingParams params = new DocumentRangeFormattingParams();
        params.setTextDocument(new TextDocumentIdentifier(uri));
        params.setRange(new Range(new Position(1, 0), new Position(1, 27))); // Only format method1
        
        FormattingOptions options = new FormattingOptions();
        options.setTabSize(4);
        options.setInsertSpaces(true);
        params.setOptions(options);
        
        CompletableFuture<List<? extends TextEdit>> future = services.rangeFormatting(params);
        List<? extends TextEdit> edits = future.get();
        
        assertNotNull(edits);
        assertTrue(edits.size() > 0);
        
        // Verify that only the specified range is formatted
        for (TextEdit edit : edits) {
            assertTrue(edit.getRange().getStart().getLine() >= 1);
            assertTrue(edit.getRange().getEnd().getLine() <= 1);
        }
    }
    
    @Test
    void testFormatDocument_WithTabsOption() throws Exception {
        String uri = workspaceRoot.resolve("TestFormattingTabs.groovy").toUri().toString();
        String unformattedContent = "class TestClass{def method(){return 42}}";
        
        services.didOpen(new org.eclipse.lsp4j.DidOpenTextDocumentParams(
            new org.eclipse.lsp4j.TextDocumentItem(uri, LANGUAGE_GROOVY, 1, unformattedContent)
        ));
        
        DocumentFormattingParams params = new DocumentFormattingParams();
        params.setTextDocument(new TextDocumentIdentifier(uri));
        
        FormattingOptions options = new FormattingOptions();
        options.setTabSize(4);
        options.setInsertSpaces(false); // Use tabs instead of spaces
        params.setOptions(options);
        
        CompletableFuture<List<? extends TextEdit>> future = services.formatting(params);
        List<? extends TextEdit> edits = future.get();
        
        assertNotNull(edits);
        assertTrue(edits.size() > 0);
        
        TextEdit edit = edits.get(0);
        assertTrue(edit.getNewText().contains("\t")); // Should contain tabs
    }
    
    @Test
    void testFormatDocument_EmptyDocument() throws Exception {
        String uri = workspaceRoot.resolve("TestFormattingEmpty.groovy").toUri().toString();
        String content = "";
        
        services.didOpen(new org.eclipse.lsp4j.DidOpenTextDocumentParams(
            new org.eclipse.lsp4j.TextDocumentItem(uri, LANGUAGE_GROOVY, 1, content)
        ));
        
        DocumentFormattingParams params = new DocumentFormattingParams();
        params.setTextDocument(new TextDocumentIdentifier(uri));
        
        FormattingOptions options = new FormattingOptions();
        options.setTabSize(4);
        options.setInsertSpaces(true);
        params.setOptions(options);
        
        CompletableFuture<List<? extends TextEdit>> future = services.formatting(params);
        List<? extends TextEdit> edits = future.get();
        
        assertTrue(edits == null || edits.isEmpty());
    }
    
    @Test
    void testFormatDocument_StringLiterals() throws Exception {
        String uri = workspaceRoot.resolve("TestFormattingStringLiterals.groovy").toUri().toString();
        // Add poor formatting to ensure changes will be made
        String content = "def   json='{ \"key\": \"value\" }'\ndef   regex=/\\s*{\\s*/";
        
        services.didOpen(new org.eclipse.lsp4j.DidOpenTextDocumentParams(
            new org.eclipse.lsp4j.TextDocumentItem(uri, LANGUAGE_GROOVY, 1, content)
        ));
        
        DocumentFormattingParams params = new DocumentFormattingParams();
        params.setTextDocument(new TextDocumentIdentifier(uri));
        
        FormattingOptions options = new FormattingOptions();
        options.setTabSize(4);
        options.setInsertSpaces(true);
        params.setOptions(options);
        
        CompletableFuture<List<? extends TextEdit>> future = services.formatting(params);
        List<? extends TextEdit> edits = future.get();
        
        assertNotNull(edits);
        assertTrue(edits.size() > 0, "Expected formatting to produce edits");
        
        String formatted = edits.get(0).getNewText();
        // String literals should remain unchanged
        assertTrue(formatted.contains("'{ \"key\": \"value\" }'"), "String literal should be preserved");
        assertTrue(formatted.contains("/\\s*{\\s*/"), "Regex literal should be preserved");
        // Check formatting was applied
        assertTrue(formatted.contains("def json = "), "Should have proper spacing around assignment");
    }
    
    @Test
    void testFormatDocument_GroovyClosures() throws Exception {
        String uri = workspaceRoot.resolve("TestFormattingClosures.groovy").toUri().toString();
        String content = "list.each{item->println item}\nlist.collect{it*2}.findAll{it>5}";
        
        services.didOpen(new org.eclipse.lsp4j.DidOpenTextDocumentParams(
            new org.eclipse.lsp4j.TextDocumentItem(uri, LANGUAGE_GROOVY, 1, content)
        ));
        
        DocumentFormattingParams params = new DocumentFormattingParams();
        params.setTextDocument(new TextDocumentIdentifier(uri));
        
        FormattingOptions options = new FormattingOptions();
        options.setTabSize(4);
        options.setInsertSpaces(true);
        params.setOptions(options);
        
        CompletableFuture<List<? extends TextEdit>> future = services.formatting(params);
        List<? extends TextEdit> edits = future.get();
        
        assertNotNull(edits);
        assertTrue(edits.size() > 0, "Expected formatting to produce edits");
        
        String formatted = edits.get(0).getNewText();
        // Closure arrow should have proper spacing
        assertTrue(formatted.contains(" -> "), "Closure arrow should have proper spacing");
    }
    
    @Test
    void testFormatDocument_GString() throws Exception {
        String uri = workspaceRoot.resolve("TestFormattingGString.groovy").toUri().toString();
        String content = "def msg=\"Hello ${name}\"\ndef multiline=\"\"\"Line1\n${value}\nLine3\"\"\"";
        
        services.didOpen(new org.eclipse.lsp4j.DidOpenTextDocumentParams(
            new org.eclipse.lsp4j.TextDocumentItem(uri, LANGUAGE_GROOVY, 1, content)
        ));
        
        DocumentFormattingParams params = new DocumentFormattingParams();
        params.setTextDocument(new TextDocumentIdentifier(uri));
        
        FormattingOptions options = new FormattingOptions();
        options.setTabSize(4);
        options.setInsertSpaces(true);
        params.setOptions(options);
        
        CompletableFuture<List<? extends TextEdit>> future = services.formatting(params);
        List<? extends TextEdit> edits = future.get();
        
        if (edits != null && !edits.isEmpty()) {
            String formatted = edits.get(0).getNewText();
            // GString interpolation should remain intact
            assertTrue(formatted.contains("${name}"));
            assertTrue(formatted.contains("${value}"));
        }
    }
    
    @Test
    void testFormatDocument_SafeNavigation() throws Exception {
        String uri = workspaceRoot.resolve("TestFormattingSafeNav.groovy").toUri().toString();
        String content = "user?.address?.city\ndef value=data?:'default'";
        
        services.didOpen(new org.eclipse.lsp4j.DidOpenTextDocumentParams(
            new org.eclipse.lsp4j.TextDocumentItem(uri, LANGUAGE_GROOVY, 1, content)
        ));
        
        DocumentFormattingParams params = new DocumentFormattingParams();
        params.setTextDocument(new TextDocumentIdentifier(uri));
        
        FormattingOptions options = new FormattingOptions();
        options.setTabSize(4);
        options.setInsertSpaces(true);
        params.setOptions(options);
        
        CompletableFuture<List<? extends TextEdit>> future = services.formatting(params);
        List<? extends TextEdit> edits = future.get();
        
        if (edits != null && !edits.isEmpty()) {
            String formatted = edits.get(0).getNewText();
            // Safe navigation should not have spaces
            assertTrue(formatted.contains("?."));
            // Elvis operator should have proper spacing
            assertTrue(formatted.contains(" ?: "));
        }
    }
    
    @Test
    void testFormatDocument_MapLiterals() throws Exception {
        String uri = workspaceRoot.resolve("TestFormattingMaps.groovy").toUri().toString();
        String content = "def map=[key:{return value},name:'test',age:25]";
        
        services.didOpen(new org.eclipse.lsp4j.DidOpenTextDocumentParams(
            new org.eclipse.lsp4j.TextDocumentItem(uri, LANGUAGE_GROOVY, 1, content)
        ));
        
        DocumentFormattingParams params = new DocumentFormattingParams();
        params.setTextDocument(new TextDocumentIdentifier(uri));
        
        FormattingOptions options = new FormattingOptions();
        options.setTabSize(4);
        options.setInsertSpaces(true);
        params.setOptions(options);
        
        CompletableFuture<List<? extends TextEdit>> future = services.formatting(params);
        List<? extends TextEdit> edits = future.get();
        
        if (edits != null && !edits.isEmpty()) {
            String formatted = edits.get(0).getNewText();
            // Map entries should have proper spacing
            assertTrue(formatted.contains(": "));
        }
    }
}