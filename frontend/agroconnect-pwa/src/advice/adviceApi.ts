import { authedJson, authedRequest } from '../auth/authedRequest'
import { ADMIN_URL, ADVICE_URL } from '../config'
import type { CropCheckStatus, CropCheckView } from '../domain/advice'
import { jsonPost } from '../sync/send'

async function items(url: string): Promise<CropCheckView[]> {
  return (await authedJson<{ items: CropCheckView[] }>(url)).items
}

export const fetchMyCropChecks = () => items(`${ADVICE_URL}/crop-checks/me`)

export const fetchCropChecks = (status: CropCheckStatus) => items(`${ADVICE_URL}/crop-checks?status=${status}`)

export const fetchAdminCropChecks = () => items(`${ADMIN_URL}/admin/activity?type=cropcheck`)

/** The photo needs the sign-in header, so it is fetched as a file and shown from memory, never from a plain link. */
export async function fetchCropCheckPhoto(id: string): Promise<Blob> {
  return (await authedRequest(`${ADVICE_URL}/crop-checks/${encodeURIComponent(id)}/photo`)).blob()
}

export const giveAdvice = (id: string, text: string) =>
  authedJson<CropCheckView>(`${ADVICE_URL}/crop-checks/${encodeURIComponent(id)}/advice`, jsonPost({ text }))
