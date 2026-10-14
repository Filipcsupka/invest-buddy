// Who runs the site, shown on the legal pages. The owner fills these in before
// public launch. Nothing here is real yet. `isPlaceholder` stays true until
// every field is replaced, and the legal pages then show the TODO marker.

export const OPERATOR = {
  name: "TODO: operator name",
  address: "TODO: registered address",
  contactEmail: "TODO: contact email",
  companyId: "TODO: company id",
} as const;

export type OperatorField = keyof typeof OPERATOR;

export const OPERATOR_FIELDS: OperatorField[] = ["name", "address", "contactEmail", "companyId"];

/** True while any field still carries the TODO marker. */
export function operatorIsPlaceholder(operator: Record<OperatorField, string> = OPERATOR): boolean {
  return OPERATOR_FIELDS.some((field) => operator[field].startsWith("TODO"));
}
