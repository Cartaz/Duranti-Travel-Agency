import type { TravelerDocument, TravelerDocumentSecret } from '../../domain/entities'
import type { TravelerDocumentApplicationDependencies, TravelerDocumentMetadata, TravelerDocumentView } from './document-ports'

export interface TravelerDocumentSecurityState {
  configured: boolean
  unlocked: boolean
}

export class TravelerDocumentApplication {
  private readonly dependencies: TravelerDocumentApplicationDependencies

  constructor(dependencies: TravelerDocumentApplicationDependencies) {
    this.dependencies = dependencies
  }

  async getSecurityState(): Promise<TravelerDocumentSecurityState> {
    return {
      configured: await this.dependencies.security.isConfigured(),
      unlocked: this.dependencies.security.isUnlocked(),
    }
  }

  async configure(passphrase: string): Promise<void> {
    await this.dependencies.security.configure(passphrase)
  }

  async unlock(passphrase: string): Promise<void> {
    await this.dependencies.security.unlock(passphrase)
  }

  lock(): void {
    this.dependencies.security.lock()
  }

  async listForTraveler(travelerId: string): Promise<TravelerDocumentMetadata[]> {
    return (await this.dependencies.documents.listMetadataByTraveler(travelerId))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }

  async listUnlockedForTraveler(travelerId: string): Promise<TravelerDocumentView[]> {
    return (await this.dependencies.documents.listByTraveler(travelerId))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }

  async create(input: {
    travelerId: string
    type: TravelerDocument['type']
    secret: TravelerDocumentSecret
    attachment?: File
  }): Promise<TravelerDocumentView> {
    const document = await this.dependencies.documents.create({
      travelerId: input.travelerId,
      type: input.type,
      secret: input.secret,
    })
    if (!input.attachment) return document

    try {
      const attachment = await this.dependencies.documents.attachFile(document.id, input.attachment)
      return { ...document, attachment }
    } catch (error) {
      await this.dependencies.documents.softDelete(document.id)
      throw error
    }
  }

  async updateSecret(id: string, secret: TravelerDocumentSecret): Promise<void> {
    await this.dependencies.documents.updateSecret(id, secret)
  }

  async replaceAttachment(id: string, file: File): Promise<void> {
    await this.dependencies.documents.attachFile(id, file)
  }

  async removeAttachment(id: string): Promise<void> {
    await this.dependencies.documents.removeAttachment(id)
  }

  async getAttachment(id: string): Promise<File | undefined> {
    return this.dependencies.documents.getAttachment(id)
  }

  async delete(id: string): Promise<void> {
    await this.dependencies.documents.softDelete(id)
  }
}
