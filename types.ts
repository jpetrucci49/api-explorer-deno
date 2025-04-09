export interface GitHubUser {
    login: string;
    id: number;
    name: string | null;
    public_repos: number;
    followers: number;
    repos_url: string;
}

export interface GitHubRepo {
    languages_url: string;
}

export interface GitHubLanguages {
    [language: string]: number;
}

export interface AnalysisResponse {
    login: string;
    publicRepos: number;
    topLanguages: { lang: string; bytes: number }[];
}
