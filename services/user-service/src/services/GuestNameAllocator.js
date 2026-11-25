/**
 * 순차 게스트 사용자명 할당기 (SRP / DIP)
 * 저장소 포트(findUsernamesByPrefix)를 통해 guest1, guest2, guest3 ... 순번을 계산합니다.
 */
export class GuestNameAllocator {
    constructor(userRepository, prefix = 'guest') {
        this.userRepository = userRepository;
        this.prefix = prefix;
        this.pattern = new RegExp(`^${prefix}(\\d+)$`, 'i');
    }

    /**
     * 다음 순번의 게스트 사용자명을 계산합니다.
     * @returns {Promise<string>}
     */
    async allocateNextName() {
        const existingUsernames = typeof this.userRepository?.findUsernamesByPrefix === 'function'
            ? await this.userRepository.findUsernamesByPrefix(this.prefix)
            : [];

        let maxNumber = 0;
        for (const name of existingUsernames) {
            if (typeof name !== 'string') continue;
            const match = name.match(this.pattern);
            if (match) {
                const num = parseInt(match[1], 10);
                if (Number.isFinite(num) && num > maxNumber) {
                    maxNumber = num;
                }
            }
        }

        return `${this.prefix}${maxNumber + 1}`;
    }
}
