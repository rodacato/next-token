export function fillTemplate(template: string, input: string): string {
  return template.replaceAll("{{input}}", input);
}
