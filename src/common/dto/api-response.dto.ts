export interface ApiResponse<T> {
  code: number
  message: string
  data: T | null
  timestamp: string
  path: string
}
