export type SolrRecord = {
    id: string
    firstName: string[]
    lastName: string[]
    emails: string[]
    usernames: string[]
    address: string[]
    city: string
    zipCode: string
    state: string
    latLong?: string;
}

export type SolrRecordXL = {
    id: string;
    line_number: number;
    line: string[];
}