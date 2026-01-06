/**
 * Pre-defined templates for creating new artifacts.
 */
export interface FileTemplate {
	title: string;
	content: string;
}

export const FILE_TEMPLATES: FileTemplate[] = [
	{
		title: 'Blog Post',
		content: `# Blog Post Title

## Introduction

Write your introduction here...

## Main Content

### Section 1

Content for section 1...

### Section 2

Content for section 2...

## Conclusion

Wrap up your thoughts here...

---

*Published: ${new Date().toLocaleDateString()}*
`
	},
	{
		title: 'Study Notes',
		content: `# Study Notes: [Topic]

## Key Concepts

- Concept 1
- Concept 2
- Concept 3

## Definitions

**Term 1:** Definition here...

**Term 2:** Definition here...

## Summary

Quick summary of the material...

## Questions to Review

1. Question 1?
2. Question 2?
3. Question 3?

## Additional Resources

- Resource 1
- Resource 2
`
	},
	{
		title: 'Outline',
		content: `# Document Outline

## 1. Introduction
   - Background
   - Purpose
   - Scope

## 2. Main Section
   - 2.1 Subsection A
   - 2.2 Subsection B
   - 2.3 Subsection C

## 3. Analysis
   - Key findings
   - Discussion

## 4. Conclusion
   - Summary
   - Recommendations
   - Next steps

## References

- Reference 1
- Reference 2
`
	},
	{
		title: 'Meeting Notes',
		content: `# Meeting Notes

**Date:** ${new Date().toLocaleDateString()}
**Attendees:** 

## Agenda

1. Topic 1
2. Topic 2
3. Topic 3

## Discussion Points

### Topic 1

Notes...

### Topic 2

Notes...

## Action Items

- [ ] Action 1 - @person - Due date
- [ ] Action 2 - @person - Due date

## Next Meeting

Date/Time:
Topics to cover:
`
	}
];

