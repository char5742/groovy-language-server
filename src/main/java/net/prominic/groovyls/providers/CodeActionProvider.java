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

import java.net.URI;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CompletableFuture;

import org.codehaus.groovy.ast.ASTNode;
import org.codehaus.groovy.ast.MethodNode;
import org.codehaus.groovy.ast.ClassNode;
import org.codehaus.groovy.ast.Parameter;
import org.codehaus.groovy.ast.AnnotationNode;
import org.eclipse.lsp4j.CodeAction;
import org.eclipse.lsp4j.CodeActionKind;
import org.eclipse.lsp4j.CodeActionParams;
import org.eclipse.lsp4j.Command;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.TextEdit;
import org.eclipse.lsp4j.WorkspaceEdit;
import org.eclipse.lsp4j.jsonrpc.messages.Either;

import groovy.lang.groovydoc.Groovydoc;
import net.prominic.groovyls.compiler.ast.ASTNodeVisitor;
import net.prominic.groovyls.compiler.util.GroovyASTUtils;
import net.prominic.groovyls.util.FileContentsTracker;
import net.prominic.lsp.utils.Positions;
import net.prominic.lsp.utils.Ranges;

public class CodeActionProvider {
	private ASTNodeVisitor ast;
	private FileContentsTracker fileContentsTracker;

	public CodeActionProvider(ASTNodeVisitor ast, FileContentsTracker fileContentsTracker) {
		this.ast = ast;
		this.fileContentsTracker = fileContentsTracker;
	}

	public CompletableFuture<List<Either<Command, CodeAction>>> provideCodeActions(CodeActionParams params) {
		if (ast == null) {
			return CompletableFuture.completedFuture(new ArrayList<>());
		}

		List<Either<Command, CodeAction>> actions = new ArrayList<>();
		URI uri = URI.create(params.getTextDocument().getUri());
		Position position = params.getRange().getStart();

		ASTNode offsetNode = ast.getNodeAtLineAndColumn(uri, position.getLine(), position.getCharacter());
		if (offsetNode == null) {
			return CompletableFuture.completedFuture(actions);
		}

		ASTNode definitionNode = GroovyASTUtils.getDefinition(offsetNode, false, ast);
		
		// Check if we can generate Groovydoc for this node
		if (definitionNode instanceof MethodNode) {
			MethodNode methodNode = (MethodNode) definitionNode;
			// Skip synthetic methods and methods without valid line numbers
			if (methodNode.getLineNumber() > 0 && !methodNode.isSynthetic() && !hasGroovydoc(methodNode)) {
				CodeAction action = createGroovydocAction(uri, methodNode);
				if (action != null) {
					actions.add(Either.forRight(action));
				}
			}
		} else if (definitionNode instanceof ClassNode) {
			ClassNode classNode = (ClassNode) definitionNode;
			// Skip synthetic classes and classes without valid line numbers
			if (classNode.getLineNumber() > 0 && !classNode.isSynthetic() && !hasGroovydoc(classNode)) {
				CodeAction action = createGroovydocAction(uri, classNode);
				if (action != null) {
					actions.add(Either.forRight(action));
				}
			}
		}

		return CompletableFuture.completedFuture(actions);
	}

	private boolean hasGroovydoc(ASTNode node) {
		if (node instanceof MethodNode) {
			MethodNode methodNode = (MethodNode) node;
			Groovydoc groovydoc = methodNode.getGroovydoc();
			return groovydoc != null && groovydoc.isPresent();
		} else if (node instanceof ClassNode) {
			ClassNode classNode = (ClassNode) node;
			Groovydoc groovydoc = classNode.getGroovydoc();
			return groovydoc != null && groovydoc.isPresent();
		}
		return false;
	}

	private CodeAction createGroovydocAction(URI uri, MethodNode methodNode) {
		// Generate Groovydoc template for method
		StringBuilder groovydocBuilder = new StringBuilder();
		groovydocBuilder.append("/**\n");
		groovydocBuilder.append(" * TODO: Add method description\n");
		
		// Add @param tags for parameters
		Parameter[] parameters = methodNode.getParameters();
		if (parameters != null && parameters.length > 0) {
			groovydocBuilder.append(" *\n");
			for (Parameter param : parameters) {
				groovydocBuilder.append(" * @param ").append(param.getName());
				groovydocBuilder.append(" TODO: Add parameter description\n");
			}
		}
		
		// Add @return tag if not void
		if (methodNode.getReturnType() != null) {
			String returnTypeName = methodNode.getReturnType().getName();
			if (returnTypeName != null && !returnTypeName.equals("void")) {
				groovydocBuilder.append(" *\n");
				groovydocBuilder.append(" * @return TODO: Add return value description\n");
			}
		}
		
		// Add @throws tag placeholder
		if (methodNode.getExceptions() != null && methodNode.getExceptions().length > 0) {
			groovydocBuilder.append(" *\n");
			for (ClassNode exception : methodNode.getExceptions()) {
				groovydocBuilder.append(" * @throws ").append(exception.getNameWithoutPackage());
				groovydocBuilder.append(" TODO: Add exception description\n");
			}
		}
		
		groovydocBuilder.append(" */\n");

		// Create text edit to insert Groovydoc
		// Consider annotations when determining insert position
		int insertLine = methodNode.getLineNumber() - 1;
		List<AnnotationNode> annotations = methodNode.getAnnotations();
		if (annotations != null && !annotations.isEmpty()) {
			// Find the first annotation line
			for (AnnotationNode annotation : annotations) {
				if (annotation.getLineNumber() > 0 && annotation.getLineNumber() - 1 < insertLine) {
					insertLine = annotation.getLineNumber() - 1;
				}
			}
		}
		
		Position insertPosition = new Position(insertLine, 0);
		Range insertRange = new Range(insertPosition, insertPosition);
		
		// Calculate proper indentation
		String indent = calculateIndentation(uri, methodNode.getLineNumber() - 1);
		if (indent != null && !indent.isEmpty()) {
			String[] groovydocLines = groovydocBuilder.toString().split("\n");
			groovydocBuilder = new StringBuilder();
			for (String line : groovydocLines) {
				groovydocBuilder.append(indent).append(line).append("\n");
			}
		}

		TextEdit textEdit = new TextEdit(insertRange, groovydocBuilder.toString());
		WorkspaceEdit workspaceEdit = new WorkspaceEdit();
		workspaceEdit.setChanges(java.util.Collections.singletonMap(uri.toString(), Arrays.asList(textEdit)));

		CodeAction codeAction = new CodeAction();
		codeAction.setTitle("Generate Groovydoc for " + methodNode.getName());
		codeAction.setKind(CodeActionKind.RefactorRewrite);
		codeAction.setEdit(workspaceEdit);

		return codeAction;
	}

	private CodeAction createGroovydocAction(URI uri, ClassNode classNode) {
		// Generate Groovydoc template for class
		StringBuilder groovydocBuilder = new StringBuilder();
		groovydocBuilder.append("/**\n");
		groovydocBuilder.append(" * TODO: Add class description\n");
		groovydocBuilder.append(" *\n");
		groovydocBuilder.append(" * @author TODO: Add author name\n");
		groovydocBuilder.append(" * @since TODO: Add version\n");
		groovydocBuilder.append(" */\n");

		// Create text edit to insert Groovydoc
		// Consider annotations when determining insert position
		int insertLine = classNode.getLineNumber() - 1;
		List<AnnotationNode> annotations = classNode.getAnnotations();
		if (annotations != null && !annotations.isEmpty()) {
			// Find the first annotation line
			for (AnnotationNode annotation : annotations) {
				if (annotation.getLineNumber() > 0 && annotation.getLineNumber() - 1 < insertLine) {
					insertLine = annotation.getLineNumber() - 1;
				}
			}
		}
		
		Position insertPosition = new Position(insertLine, 0);
		Range insertRange = new Range(insertPosition, insertPosition);
		
		// Calculate proper indentation
		String indent = calculateIndentation(uri, classNode.getLineNumber() - 1);
		if (indent != null) {
			String[] groovydocLines = groovydocBuilder.toString().split("\n");
			groovydocBuilder = new StringBuilder();
			for (String line : groovydocLines) {
				groovydocBuilder.append(indent).append(line).append("\n");
			}
		}

		TextEdit textEdit = new TextEdit(insertRange, groovydocBuilder.toString());
		WorkspaceEdit workspaceEdit = new WorkspaceEdit();
		workspaceEdit.setChanges(java.util.Collections.singletonMap(uri.toString(), Arrays.asList(textEdit)));

		CodeAction codeAction = new CodeAction();
		codeAction.setTitle("Generate Groovydoc for class " + classNode.getNameWithoutPackage());
		codeAction.setKind(CodeActionKind.RefactorRewrite);
		codeAction.setEdit(workspaceEdit);

		return codeAction;
	}
	
	private String calculateIndentation(URI uri, int lineNumber) {
		String fileContent = fileContentsTracker.getContents(uri);
		if (fileContent == null) {
			return "";
		}
		
		String[] lines = fileContent.split("\n");
		if (lineNumber < 0 || lineNumber >= lines.length) {
			return "";
		}
		
		String targetLine = lines[lineNumber];
		StringBuilder indentBuilder = new StringBuilder();
		
		for (char c : targetLine.toCharArray()) {
			if (c == ' ' || c == '\t') {
				indentBuilder.append(c);
			} else {
				break;
			}
		}
		
		return indentBuilder.toString();
	}
}