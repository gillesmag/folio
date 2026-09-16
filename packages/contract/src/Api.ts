import { Schema } from 'effect';
import {
	HttpApi,
	HttpApiEndpoint,
	HttpApiGroup,
	HttpApiSchema,
	OpenApi
} from 'effect/unstable/httpapi';
import { Authentication } from './Auth.ts';
import { Comment, CommentInput } from './Comment.ts';
import { Document, DocumentInput, DocumentPatch, DocumentSummary } from './Document.ts';
import {
	CommentNotFound,
	DocumentNotFound,
	Forbidden,
	Unauthorized,
	OrganizationNotFound,
	Conflict
} from './errors.ts';
import { CommentId, DocumentId, OrganizationId, UserId } from './ids.ts';
import {
	Organization,
	OrganizationDetails,
	OrganizationInput,
	Invitation,
	InvitationInput
} from './Organization.ts';
import { User } from './User.ts';

export class DocumentsApi extends HttpApiGroup.make('documents')
	.add(
		HttpApiEndpoint.get('list', '/', {
			success: Schema.Array(DocumentSummary),
			error: Unauthorized
		}),
		HttpApiEndpoint.get('get', '/:id', {
			params: { id: DocumentId },
			success: Document,
			error: [DocumentNotFound, Forbidden]
		}),
		HttpApiEndpoint.post('create', '/', {
			payload: DocumentInput,
			success: Document.pipe(HttpApiSchema.status(201)),
			error: [Unauthorized, OrganizationNotFound]
		}),
		HttpApiEndpoint.put('replace', '/:id', {
			params: { id: DocumentId },
			payload: DocumentInput,
			success: Document,
			error: [Unauthorized, Forbidden, DocumentNotFound, OrganizationNotFound]
		}),
		HttpApiEndpoint.patch('update', '/:id', {
			params: { id: DocumentId },
			payload: DocumentPatch,
			success: Document,
			error: [Unauthorized, Forbidden, DocumentNotFound, OrganizationNotFound]
		}),
		HttpApiEndpoint.delete('remove', '/:id', {
			params: { id: DocumentId },
			success: HttpApiSchema.NoContent,
			error: [Unauthorized, Forbidden, DocumentNotFound]
		})
	)
	.middleware(Authentication)
	.prefix('/documents')
	.annotateMerge(OpenApi.annotations({ title: 'Documents' })) {}

export class CommentsApi extends HttpApiGroup.make('comments')
	.add(
		HttpApiEndpoint.get('list', '/documents/:documentId/comments', {
			params: { documentId: DocumentId },
			success: Schema.Array(Comment.json),
			error: [DocumentNotFound, Forbidden]
		}),
		HttpApiEndpoint.post('create', '/documents/:documentId/comments', {
			params: { documentId: DocumentId },
			payload: CommentInput,
			success: Comment.json.pipe(HttpApiSchema.status(201)),
			error: [Unauthorized, DocumentNotFound, Forbidden]
		}),
		HttpApiEndpoint.patch('resolve', '/comments/:id', {
			params: { id: CommentId },
			payload: Schema.Struct({ resolved: Schema.Boolean }),
			success: Comment.json,
			error: [Unauthorized, CommentNotFound, Forbidden]
		}),
		HttpApiEndpoint.delete('remove', '/comments/:id', {
			params: { id: CommentId },
			success: HttpApiSchema.NoContent,
			error: [Unauthorized, CommentNotFound, Forbidden]
		})
	)
	.middleware(Authentication)
	.annotateMerge(OpenApi.annotations({ title: 'Comments' })) {}

export class OrganizationsApi extends HttpApiGroup.make('organizations')
	.add(
		HttpApiEndpoint.get('list', '/', { success: Schema.Array(Organization), error: Unauthorized }),
		HttpApiEndpoint.post('create', '/', {
			payload: OrganizationInput,
			success: Organization.pipe(HttpApiSchema.status(201)),
			error: [Unauthorized, Conflict]
		}),
		HttpApiEndpoint.get('invitations', '/invitations', {
			success: Schema.Array(Invitation),
			error: Unauthorized
		}),
		HttpApiEndpoint.post('accept', '/invitations/:id/accept', {
			params: { id: Schema.String },
			success: HttpApiSchema.NoContent,
			error: [Unauthorized, OrganizationNotFound]
		}),
		HttpApiEndpoint.delete('cancelInvitation', '/invitations/:id', {
			params: { id: Schema.String },
			success: HttpApiSchema.NoContent,
			error: [Unauthorized, OrganizationNotFound]
		}),
		HttpApiEndpoint.get('details', '/:id', {
			params: { id: OrganizationId },
			success: OrganizationDetails,
			error: [Unauthorized, OrganizationNotFound]
		}),
		HttpApiEndpoint.post('invite', '/:id/invitations', {
			params: { id: OrganizationId },
			payload: InvitationInput,
			success: HttpApiSchema.NoContent,
			error: [Unauthorized, OrganizationNotFound, Forbidden, Conflict]
		}),
		HttpApiEndpoint.delete('removeMember', '/:id/members/:userId', {
			params: { id: OrganizationId, userId: UserId },
			success: HttpApiSchema.NoContent,
			error: [Unauthorized, OrganizationNotFound, Forbidden]
		})
	)
	.middleware(Authentication)
	.prefix('/organizations')
	.annotateMerge(OpenApi.annotations({ title: 'Organizations' })) {}

export class SystemApi extends HttpApiGroup.make('system', { topLevel: true }).add(
	HttpApiEndpoint.get('health', '/health', { success: HttpApiSchema.NoContent }),
	HttpApiEndpoint.get('me', '/me', { success: User, error: Unauthorized }).middleware(
		Authentication
	)
) {}

export class Api extends HttpApi.make('folio')
	.add(DocumentsApi)
	.add(CommentsApi)
	.add(OrganizationsApi)
	.add(SystemApi)
	.prefix('/api')
	.annotateMerge(
		OpenApi.annotations({
			title: 'Folio API',
			description: 'Push, read, edit and comment on markdown documents.'
		})
	) {}
