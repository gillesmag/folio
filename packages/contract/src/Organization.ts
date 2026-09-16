import { Schema } from 'effect';

/** Better Auth stores who created an organization separately from membership roles. */
export const organizationFields = {
	creatorId: {
		type: 'string',
		required: true,
		input: false,
		unique: true,
		references: { model: 'user', field: 'id', onDelete: 'cascade' }
	}
} as const;

export const OrganizationInput = Schema.Struct({
	name: Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(80)),
	slug: Schema.String.check(
		Schema.isPattern(/^(?!personal$)[a-z0-9]+(?:-[a-z0-9]+)*$/),
		Schema.isMinLength(2),
		Schema.isMaxLength(48)
	)
});

/** An ID, slug, or the reserved value "personal". */
export const OrganizationSelector = Schema.String.check(
	Schema.isMinLength(1),
	Schema.isMaxLength(80)
);
