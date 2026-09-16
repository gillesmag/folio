import { Schema } from 'effect';
import { OrganizationId, UserId } from './ids.ts';

export const Organization = Schema.Struct({
	id: OrganizationId,
	name: Schema.String,
	slug: Schema.String,
	creatorId: UserId
});
export type Organization = typeof Organization.Type;

export const OrganizationInput = Schema.Struct({
	name: Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(80)),
	slug: Schema.String.check(
		Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
		Schema.isMinLength(2),
		Schema.isMaxLength(48)
	)
});
export type OrganizationInput = typeof OrganizationInput.Type;

/** An ID, slug, or the reserved value "personal". */
export const OrganizationSelector = Schema.String.check(
	Schema.isMinLength(1),
	Schema.isMaxLength(80)
);

export const Invitation = Schema.Struct({
	id: Schema.String,
	organizationId: OrganizationId,
	organizationName: Schema.String,
	email: Schema.String,
	expiresAt: Schema.String
});
export type Invitation = typeof Invitation.Type;

export const InvitationInput = Schema.Struct({
	email: Schema.String.check(
		Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
		Schema.isMaxLength(254)
	)
});

export const OrganizationDetails = Schema.Struct({
	organization: Organization,
	members: Schema.Array(Schema.Struct({ id: UserId, name: Schema.String, email: Schema.String })),
	invitations: Schema.Array(Invitation)
});
export type OrganizationDetails = typeof OrganizationDetails.Type;
