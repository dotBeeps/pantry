---
name: spring-boot
description: "Spring Boot conventions: dependency injection, configuration, testing. Use when working with Spring Boot applications."
license: MIT
---

# Spring Boot Conventions

## Dependency Injection

- Constructor injection only — no `@Autowired` on fields, ever
- If a class has more than ~4 injected dependencies, it's doing too much
- Use `@RequiredArgsConstructor` (Lombok) to reduce boilerplate if the project already uses Lombok

## REST Controllers

- `@RestController` — not `@Controller` + `@ResponseBody`
- Return `ResponseEntity<T>` when you need to control status codes; plain `T` otherwise
- Validation with `@Valid` on request bodies; handle `MethodArgumentNotValidException` globally
- `@ControllerAdvice` for centralized exception handling

## Configuration

- `application.yml` not `application.properties`
- `@ConfigurationProperties` for complex config — not scattered `@Value` annotations
- `@Value` is fine for simple single-property injection

## JPA / Data

- `@Transactional` belongs at the **service** layer, not the repository
- Repositories extend `JpaRepository<T, ID>` — don't add methods that belong in services
- Fetch lazily by default; use explicit joins or `@EntityGraph` for known N+1 scenarios
- Never expose JPA entities directly from REST endpoints — map to DTOs

## Testing

- `@SpringBootTest` for full integration tests
- `@DataJpaTest` for repository-layer tests (spins up H2 or Testcontainers)
- `@WebMvcTest` for controller tests with `MockMvc`
- Testcontainers for real DB integration — never mock the DB
- `@MockBean` only for external services (email, payment, etc.), not internal spring beans
