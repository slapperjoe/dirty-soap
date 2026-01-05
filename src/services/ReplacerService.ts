
export interface ReplacementRule {
    id: string;
    active: boolean;
    name: string;
    matchType: 'Url' | 'Body' | 'Header';
    matchPattern: string;
    replaceWith: string;
    isRegex: boolean;
}

export class ReplacerService {
    private rules: ReplacementRule[] = [];



    public addRule(rule: ReplacementRule) {
        this.rules.push(rule);
    }

    public updateRule(updatedRule: ReplacementRule) {
        const index = this.rules.findIndex(r => r.id === updatedRule.id);
        if (index !== -1) {
            this.rules[index] = updatedRule;
        }
    }

    public removeRule(id: string) {
        this.rules = this.rules.filter(r => r.id !== id);
    }

    public getRules(): ReplacementRule[] {
        return this.rules;
    }

    public processRequest(reqBody: string, _reqUrl: string): string {
        let processedBody = reqBody;

        // Filter rules that apply to Body and are Active, AND if they have a URL condition, it matches
        // For simplicity in this v1, matchType 'Body' implies we are replacing content IN the body.
        // We might want separate 'Scope' vs 'Condition'. 
        // Design says: MatchType = Url | Body | Header. 
        // If MatchType is Body, we replace IN Body.

        const bodyRules = this.rules.filter(r => r.active && r.matchType === 'Body');

        for (const rule of bodyRules) {
            try {
                if (rule.isRegex) {
                    const regex = new RegExp(rule.matchPattern, 'g');
                    processedBody = processedBody.replace(regex, rule.replaceWith);
                } else {
                    // Global string replace
                    processedBody = processedBody.split(rule.matchPattern).join(rule.replaceWith);
                }
            } catch (e) {
                console.error(`Error applying rule ${rule.name}:`, e);
            }
        }

        return processedBody;
    }

    public processResponse(resBody: string): string {
        let processedBody = resBody;
        const bodyRules = this.rules.filter(r => r.active && r.matchType === 'Body');

        for (const rule of bodyRules) {
            try {
                if (rule.isRegex) {
                    const regex = new RegExp(rule.matchPattern, 'g');
                    processedBody = processedBody.replace(regex, rule.replaceWith);
                } else {
                    processedBody = processedBody.split(rule.matchPattern).join(rule.replaceWith);
                }
            } catch (e) {
                console.error(`Error applying rule ${rule.name}:`, e);
            }
        }
        return processedBody;
    }
}
