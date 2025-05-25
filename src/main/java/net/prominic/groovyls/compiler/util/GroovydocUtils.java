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
package net.prominic.groovyls.compiler.util;

import groovy.lang.groovydoc.Groovydoc;
import java.util.ArrayList;
import java.util.List;

public class GroovydocUtils {
	public static String groovydocToMarkdownDescription(Groovydoc groovydoc) {
		if (groovydoc == null || !groovydoc.isPresent()) {
			return null;
		}
		String content = groovydoc.getContent();
		String[] lines = content.split("\n");
		StringBuilder descriptionBuilder = new StringBuilder();
		List<String> paramTags = new ArrayList<>();
		String returnTag = null;
		List<String> throwsTags = new ArrayList<>();
		String currentTag = null;
		StringBuilder currentTagContent = new StringBuilder();
		
		int n = lines.length;
		if (n == 1) {
			// strip end of groovydoc comment
			int c = lines[0].indexOf("*/");
			if (c != -1) {
				lines[0] = lines[0].substring(0, c);
			}
		}
		// strip start of groovydoc coment
		String line = lines[0];
		int lengthToRemove = Math.min(line.length(), 3);
		line = line.substring(lengthToRemove).trim();
		if (line.length() > 0 && !line.startsWith("@")) {
			appendLine(descriptionBuilder, line);
		}
		
		for (int i = 1; i < n; i++) {
			line = lines[i];
			int star = line.indexOf("*");
			if (star > -1) {
				line = line.substring(star + 1).trim();
			}
			
			// Check if line contains */ at the end (last line of comment)
			int endComment = line.indexOf("*/");
			if (endComment != -1) {
				line = line.substring(0, endComment).trim();
				if (line.length() == 0) {
					continue;
				}
			}
			
			if (line.startsWith("@")) {
				// Save previous tag if exists
				if (currentTag != null) {
					saveTag(currentTag, currentTagContent.toString().trim(), paramTags, throwsTags);
					if (currentTag.equals("@return") || currentTag.equals("@returns")) {
						returnTag = currentTagContent.toString().trim();
					}
				}
				
				// Parse new tag
				int spaceIndex = line.indexOf(" ");
				if (spaceIndex > 0) {
					currentTag = line.substring(0, spaceIndex);
					currentTagContent = new StringBuilder(line.substring(spaceIndex + 1).trim());
				} else {
					currentTag = line;
					currentTagContent = new StringBuilder();
				}
			} else if (currentTag != null) {
				// Continue building current tag content
				if (currentTagContent.length() > 0) {
					currentTagContent.append(" ");
				}
				currentTagContent.append(line);
			} else {
				// Regular description line
				appendLine(descriptionBuilder, line);
			}
		}
		
		// Save last tag if exists
		if (currentTag != null) {
			saveTag(currentTag, currentTagContent.toString().trim(), paramTags, throwsTags);
			if (currentTag.equals("@return") || currentTag.equals("@returns")) {
				returnTag = currentTagContent.toString().trim();
			}
		}
		
		// Build final markdown
		StringBuilder markdownBuilder = new StringBuilder();
		String description = descriptionBuilder.toString().trim();
		if (description.length() > 0) {
			markdownBuilder.append(description);
		}
		
		// Add parameters section
		if (!paramTags.isEmpty()) {
			if (markdownBuilder.length() > 0) {
				markdownBuilder.append("\n\n");
			}
			markdownBuilder.append("**Parameters:**\n");
			for (String param : paramTags) {
				markdownBuilder.append("- ").append(param).append("\n");
			}
		}
		
		// Add returns section
		if (returnTag != null && returnTag.length() > 0) {
			if (markdownBuilder.length() > 0) {
				markdownBuilder.append("\n\n");
			}
			markdownBuilder.append("**Returns:** ").append(reformatLine(returnTag));
		}
		
		// Add throws section
		if (!throwsTags.isEmpty()) {
			if (markdownBuilder.length() > 0) {
				markdownBuilder.append("\n\n");
			}
			markdownBuilder.append("**Throws:**\n");
			for (String throwsTag : throwsTags) {
				markdownBuilder.append("- ").append(throwsTag).append("\n");
			}
		}
		
		return markdownBuilder.toString();
	}
	
	private static void saveTag(String tag, String content, List<String> paramTags, List<String> throwsTags) {
		if (tag.equals("@param")) {
			if (content.length() > 0) {
				// Format: paramName description
				int spaceIndex = content.indexOf(" ");
				if (spaceIndex > 0) {
					String paramName = content.substring(0, spaceIndex);
					String paramDesc = content.substring(spaceIndex + 1).trim();
					paramTags.add("`" + paramName + "` - " + paramDesc);
				} else {
					paramTags.add("`" + content + "`");
				}
			}
		} else if (tag.equals("@throws") || tag.equals("@exception")) {
			if (content.length() > 0) {
				// Format: ExceptionType description
				int spaceIndex = content.indexOf(" ");
				if (spaceIndex > 0) {
					String exceptionType = content.substring(0, spaceIndex);
					String exceptionDesc = content.substring(spaceIndex + 1).trim();
					throwsTags.add("`" + exceptionType + "` - " + exceptionDesc);
				} else {
					throwsTags.add("`" + content + "`");
				}
			}
		}
	}

	private static void appendLine(StringBuilder markdownBuilder, String line) {
		line = reformatLine(line);
		if (line.length() == 0) {
			return;
		}
		markdownBuilder.append(line);
		markdownBuilder.append("\n");
	}

	private static String reformatLine(String line) {
		// remove all attributes (including namespaced)
		line = line.replaceAll("<(\\w+)(?:\\s+\\w+(?::\\w+)?=(\"|\')[^\"\']*\\2)*\\s*(\\/{0,1})>", "<$1$3>");
		line = line.replaceAll("<pre>", "\n\n```\n");
		line = line.replaceAll("</pre>", "\n```\n");
		line = line.replaceAll("</?(em|i)>", "_");
		line = line.replaceAll("</?(strong|b)>", "**");
		line = line.replaceAll("</?code>", "`");
		line = line.replaceAll("<hr ?\\/>", "\n\n---\n\n");
		line = line.replaceAll("<(p|ul|ol|dl|li|dt|table|tr|div|blockquote)>", "\n\n");

		// to add a line break to markdown, there needs to be at least two
		// spaces at the end of the line
		line = line.replaceAll("<br\\s*/?>\\s*", "  \n");
		line = line.replaceAll("<\\/{0,1}\\w+\\/{0,1}>", "");
		return line;
	}
}
