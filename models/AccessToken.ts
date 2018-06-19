export interface AccessToken {
  access: string;
  refresh: string;
  user: string;
  access_code?: string;
}